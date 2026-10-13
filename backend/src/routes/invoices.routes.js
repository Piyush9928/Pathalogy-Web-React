const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { computeInvoiceTotals, round2 } = require('../utils/billing');
const { isMoney, isPositiveMoney, isPositiveInt, idsBelongToHospital } = require('../utils/validate');
const { dispatchNotification } = require('../utils/notifications');

const router = express.Router();
router.use(requireAuth);

// Every :id in this router must be a positive integer, so a text id is a 404 instead of a database error.
router.param('id', (req, res, next, id) => (isPositiveInt(id) ? next() : res.status(404).json({ message: 'Invoice not found.' })));

const GST_RATES = [0, 5, 12, 18];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque'];

async function generateInvoiceNumber(client) {
  const seqRes = await client.query(`SELECT nextval('invoice_number_seq') AS seq`);
  const seq = seqRes.rows[0].seq;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `INV-${yearMonth}-${String(seq).padStart(4, '0')}`;
}

async function getPaidAmount(client, invoiceId) {
  const res = await client.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1`, [invoiceId]);
  return Number(res.rows[0].paid);
}

async function hydrateInvoice(client, invoice) {
  const paid = await getPaidAmount(client, invoice.id);
  const totals = computeInvoiceTotals(invoice, paid);
  return { ...invoice, ...totals };
}

// GET /api/invoices?search=
router.get('/', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT i.*, p.full_name AS patient_name, p.uhid AS patient_uhid, b.booking_number, d.full_name AS doctor_name,
            COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN doctors d ON d.id = i.doctor_id
     WHERE i.hospital_id = $1 AND (p.full_name ILIKE $2 OR p.uhid ILIKE $2 OR i.invoice_number ILIKE $2)
     ORDER BY i.invoice_date DESC`,
    [hospitalId, `%${search}%`]
  );

  const invoices = result.rows.map((row) => ({ ...row, ...computeInvoiceTotals(row, row.paid_amount) }));

  const totals = invoices.reduce(
    (acc, inv) => ({
      grandTotal: acc.grandTotal + inv.grandTotal,
      paidAmount: acc.paidAmount + inv.paidAmount,
      balanceDue: acc.balanceDue + inv.balanceDue,
    }),
    { grandTotal: 0, paidAmount: 0, balanceDue: 0 }
  );

  res.json({ invoices, totals, gstRates: GST_RATES, paymentModes: PAYMENT_MODES });
});

// GET /api/invoices/:id
router.get('/:id', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const invoiceRes = await pool.query(
    `SELECT i.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.phone AS patient_phone,
            b.booking_number, d.full_name AS doctor_name
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN doctors d ON d.id = i.doctor_id
     WHERE i.id = $1 AND i.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!invoiceRes.rows[0]) return res.status(404).json({ message: 'Invoice not found.' });

  const itemsRes = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1`, [id]);
  const paymentsRes = await pool.query(`SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at ASC`, [id]);

  const hydrated = await hydrateInvoice(pool, invoiceRes.rows[0]);
  res.json({ invoice: hydrated, items: itemsRes.rows, payments: paymentsRes.rows });
});

const MAX_ITEMS = 200;
const MAX_AMOUNT = 9999999999.99; // NUMERIC(12,2)

// POST /api/invoices
// body: { patientId, doctorId?, bookingId?, items: [{name, quantity, unitPrice, testId?}],
//         discountAmount, gstPercent, paidAmount, paymentMode, isCreditSale, creditDays, creditTerms }
router.post('/', requirePermission('billing.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!b.patientId) return res.status(400).json({ message: 'Patient is required.' });
  if (!Array.isArray(b.items) || b.items.length === 0) return res.status(400).json({ message: 'Add at least one line item.' });
  if (b.items.length > MAX_ITEMS) return res.status(400).json({ message: `An invoice can have at most ${MAX_ITEMS} line items.` });
  if (!GST_RATES.includes(Number(b.gstPercent))) return res.status(400).json({ message: 'Invalid GST rate.' });
  if (b.paymentMode !== undefined && !PAYMENT_MODES.includes(b.paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });

  // Line items are what the patient is billed for, so each must be a sensible quantity and price. A negative price
  // or quantity would quietly reduce the invoice total (and with it the money the hospital collects).
  for (const [i, item] of b.items.entries()) {
    const n = i + 1;
    if (!String(item.name || '').trim() || String(item.name).length > 200) return res.status(400).json({ message: `Item ${n}: a name of up to 200 characters is required.` });
    if (item.quantity !== undefined && !isPositiveInt(item.quantity)) return res.status(400).json({ message: `Item ${n}: quantity must be a whole number greater than 0.` });
    if (item.unitPrice !== undefined && !isMoney(item.unitPrice, 99999999.99)) return res.status(400).json({ message: `Item ${n}: unit price must be 0 or more.` });
    if (item.testId && !isPositiveInt(item.testId)) return res.status(400).json({ message: `Item ${n}: invalid test.` });
  }
  if (b.discountAmount !== undefined && b.discountAmount !== '' && !isMoney(b.discountAmount, MAX_AMOUNT)) return res.status(400).json({ message: 'Discount must be 0 or more.' });
  if (b.paidAmount !== undefined && b.paidAmount !== '' && !isMoney(b.paidAmount, MAX_AMOUNT)) return res.status(400).json({ message: 'Paid amount must be 0 or more.' });
  if (b.isCreditSale !== undefined && typeof b.isCreditSale !== 'boolean') return res.status(400).json({ message: 'isCreditSale must be true or false.' });
  if (b.creditDays !== undefined && !(Number.isInteger(Number(b.creditDays)) && Number(b.creditDays) >= 0 && Number(b.creditDays) <= 365)) return res.status(400).json({ message: 'Credit days must be between 0 and 365.' });
  if (b.creditTerms && String(b.creditTerms).length > 300) return res.status(400).json({ message: 'Credit terms must be 300 characters or fewer.' });

  const subTotal = round2(b.items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitPrice || 0), 0));
  const discountAmount = Number(b.discountAmount || 0);
  if (subTotal > MAX_AMOUNT) return res.status(400).json({ message: 'The invoice total is too large.' });
  if (discountAmount > subTotal) return res.status(400).json({ message: 'Discount cannot exceed the subtotal.' });

  // What the patient actually owes after discount and GST - a payment can never exceed it.
  const grandTotal = round2(subTotal - discountAmount + round2((subTotal - discountAmount) * Number(b.gstPercent) / 100));
  const paidAmount = Number(b.paidAmount || 0);
  if (paidAmount > grandTotal) return res.status(400).json({ message: `Paid amount cannot exceed the invoice total of ₹${grandTotal}.` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Every id the caller sends is a global serial: patient, doctor, booking and tests must be this hospital's own.
    if (!(await idsBelongToHospital(client, 'patients', hospitalId, [b.patientId]))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Patient not found.' });
    }
    if (b.doctorId && !(await idsBelongToHospital(client, 'doctors', hospitalId, [b.doctorId]))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    if (b.bookingId) {
      const bk = await client.query(`SELECT patient_id FROM bookings WHERE id = $1 AND hospital_id = $2`, [b.bookingId, hospitalId]);
      if (!bk.rows[0] || bk.rows[0].patient_id !== Number(b.patientId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'That booking does not belong to this patient.' });
      }
    }
    const testIds = b.items.map((i) => i.testId).filter(Boolean);
    if (testIds.length && !(await idsBelongToHospital(client, 'tests', hospitalId, testIds))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'One or more tests were not found.' });
    }

    const invoiceNumber = await generateInvoiceNumber(client);

    const invoiceRes = await client.query(
      `INSERT INTO invoices (
         hospital_id, invoice_number, patient_id, booking_id, doctor_id, sub_total, discount_amount,
         gst_percent, payment_mode, is_credit_sale, credit_days, credit_terms, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        hospitalId, invoiceNumber, b.patientId, b.bookingId || null, b.doctorId || null, subTotal, discountAmount,
        b.gstPercent, b.paymentMode || 'Cash', b.isCreditSale === true, b.creditDays ?? 30, b.creditTerms || null, name,
      ]
    );
    const invoice = invoiceRes.rows[0];

    for (const item of b.items) {
      await client.query(
        `INSERT INTO invoice_line_items (invoice_id, name, quantity, unit_price, test_id) VALUES ($1,$2,$3,$4,$5)`,
        [invoice.id, String(item.name).trim(), item.quantity || 1, item.unitPrice || 0, item.testId || null]
      );
    }

    if (paidAmount > 0) {
      await client.query(
        `INSERT INTO payments (invoice_id, amount, payment_mode, recorded_by) VALUES ($1,$2,$3,$4)`,
        [invoice.id, paidAmount, b.paymentMode || 'Cash', name]
      );
    }

    // Fixed gap: wires the original's dormant "Payment Received"/"Invoice Due" templates to
    // real triggers - Payment Received fires if any amount was paid at creation time,
    // Invoice Due fires when a balance remains on a credit sale (the original had no
    // scheduler, so this mirrors it as a one-time notice at invoice-creation time rather
    // than inventing a background job that doesn't exist anywhere else in this rebuild).
    const patientRes = await client.query(`SELECT full_name, email, phone FROM patients WHERE id = $1`, [b.patientId]);
    const patient = patientRes.rows[0];
    if (patient) {
      if (paidAmount > 0) {
        await dispatchNotification(client, {
          hospitalId,
          triggerEvent: 'Payment Received',
          placeholders: { Amount: paidAmount, InvoiceNumber: invoiceNumber },
          recipient: { email: patient.email, phone: patient.phone },
        });
      }
      const totals = computeInvoiceTotals(invoice, paidAmount);
      if (b.isCreditSale && totals.balanceDue > 0) {
        await dispatchNotification(client, {
          hospitalId,
          triggerEvent: 'Invoice Due',
          placeholders: { PatientName: patient.full_name, InvoiceNumber: invoiceNumber, BalanceDue: totals.balanceDue },
          recipient: { email: patient.email, phone: patient.phone },
        });
      }
    }

    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Invoice', module: 'Billing', details: invoiceNumber, ip: req.ip });
    res.status(201).json(await hydrateInvoice(pool, invoice));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/invoices/:id/payments { amount, paymentMode }
router.post('/:id/payments', requirePermission('billing.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { amount, paymentMode } = req.body;

  if (!isPositiveMoney(amount, MAX_AMOUNT)) return res.status(400).json({ message: 'Enter a valid payment amount.' });
  if (!PAYMENT_MODES.includes(paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Locked so two payments arriving together are checked against the balance one at a time
    // (otherwise both pass the "does not exceed balance due" check and the invoice is overpaid).
    const invoiceRes = await client.query(`SELECT * FROM invoices WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const paidSoFar = await getPaidAmount(client, id);
    const totals = computeInvoiceTotals(invoice, paidSoFar);
    if (Number(amount) > totals.balanceDue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Payment amount exceeds the balance due of ₹${totals.balanceDue}.` });
    }

    await client.query(
      `INSERT INTO payments (invoice_id, amount, payment_mode, recorded_by) VALUES ($1,$2,$3,$4)`,
      [id, amount, paymentMode, name]
    );

    const patientRes = await client.query(`SELECT full_name, email, phone FROM patients WHERE id = $1`, [invoice.patient_id]);
    if (patientRes.rows[0]) {
      await dispatchNotification(client, {
        hospitalId,
        triggerEvent: 'Payment Received',
        placeholders: { Amount: amount, InvoiceNumber: invoice.invoice_number },
        recipient: { email: patientRes.rows[0].email, phone: patientRes.rows[0].phone },
      });
    }

    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Record Payment', module: 'Billing', details: `${invoice.invoice_number}: ₹${amount} via ${paymentMode}`, ip: req.ip });
    res.json(await hydrateInvoice(pool, invoice));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/invoices/:id/refund { amount, reason }
router.post('/:id/refund', requirePermission('billing.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { amount, reason } = req.body;

  if (!isPositiveMoney(amount, MAX_AMOUNT)) return res.status(400).json({ message: 'Enter a valid refund amount.' });
  if (!String(reason || '').trim()) return res.status(400).json({ message: 'A reason is required for a refund.' });
  if (String(reason).length > 300) return res.status(400).json({ message: 'Reason must be 300 characters or fewer.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invoiceRes = await client.query(`SELECT * FROM invoices WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const paidSoFar = await getPaidAmount(client, id);
    const maxRefundable = round2(paidSoFar - Number(invoice.refund_amount));
    if (Number(amount) > maxRefundable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Refund cannot exceed the amount still refundable: ₹${maxRefundable}.` });
    }

    const result = await client.query(
      `UPDATE invoices SET refund_amount = refund_amount + $1, refund_reason = $2, refunded_on = NOW() WHERE id = $3 RETURNING *`,
      [amount, String(reason).trim(), id]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Refund Invoice', module: 'Billing', details: `${invoice.invoice_number}: ₹${amount} (${String(reason).trim()})`, severity: 'Warning', ip: req.ip });
    res.json(await hydrateInvoice(pool, result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
