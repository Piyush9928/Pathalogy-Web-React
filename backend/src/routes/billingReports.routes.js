const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { computeInvoiceTotals } = require('../utils/billing');

const router = express.Router();
router.use(requireAuth);

// Thrown errors with expose=true are returned as 400 by the central error handler.
function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  e.expose = true;
  return e;
}

function parseDate(value, label) {
  if (value === undefined || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw badRequest(`Invalid ${label} date.`);
  return d;
}

function dateRangeParams(query) {
  const to = parseDate(query.to, 'to') || new Date();
  const from = parseDate(query.from, 'from') || new Date(to.getTime() - 30 * 86400000);
  if (from > to) throw badRequest('The from date must not be after the to date.');
  if (to - from > 5 * 366 * 86400000) throw badRequest('The date range can be at most 5 years.');
  return { from, to };
}

/** Loads all invoices with computed totals for a hospital + date range, for report aggregation. */
async function loadInvoicesWithTotals(hospitalId, from, to) {
  const invRes = await pool.query(
    `SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount,
            (SELECT MIN(paid_at) FROM payments WHERE invoice_id = i.id) AS first_payment_at,
            (SELECT MAX(paid_at) FROM payments WHERE invoice_id = i.id) AS last_payment_at
     FROM invoices i WHERE i.hospital_id = $1 AND i.invoice_date BETWEEN $2 AND $3`,
    [hospitalId, from, to]
  );
  return invRes.rows.map((row) => ({ ...row, ...computeInvoiceTotals(row, row.paid_amount) }));
}

// GET /api/billing-reports/daily-collection?date=
router.get('/daily-collection', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const date = parseDate(req.query.date, 'report') || new Date();
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  const paymentsRes = await pool.query(
    `SELECT p.payment_mode, p.amount FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.hospital_id = $1 AND p.paid_at BETWEEN $2 AND $3`,
    [hospitalId, dayStart, dayEnd]
  );

  const byMode = {};
  for (const p of paymentsRes.rows) {
    byMode[p.payment_mode] = byMode[p.payment_mode] || { paymentMode: p.payment_mode, invoiceCount: 0, totalAmount: 0 };
    byMode[p.payment_mode].invoiceCount += 1;
    byMode[p.payment_mode].totalAmount += Number(p.amount);
  }

  // 7-day trend
  const trendRes = await pool.query(
    `SELECT p.paid_at::date AS day, SUM(p.amount) AS total
     FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE i.hospital_id = $1 AND p.paid_at >= $2::date - INTERVAL '6 days' AND p.paid_at <= $2::date + INTERVAL '1 day'
     GROUP BY day ORDER BY day ASC`,
    [hospitalId, date]
  );

  res.json({ byMode: Object.values(byMode), trend: trendRes.rows.map((r) => ({ date: r.day, total: Number(r.total) })) });
});

// GET /api/billing-reports/department-workload?from=&to=
router.get('/department-workload', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { from, to } = dateRangeParams(req.query);

  const result = await pool.query(
    `SELECT dep.name AS department, COUNT(*) AS total_tests,
       COUNT(*) FILTER (WHERE b.status IN ('Booked','Collected')) AS pending_tests,
       COUNT(*) FILTER (WHERE b.status IN ('Verified','Approved','Delivered')) AS completed_tests
     FROM booking_tests bt
     JOIN bookings b ON b.id = bt.booking_id
     JOIN tests t ON t.id = bt.test_id
     LEFT JOIN departments dep ON dep.id = t.department_id
     WHERE b.hospital_id = $1 AND b.booking_date BETWEEN $2 AND $3
     GROUP BY dep.name ORDER BY total_tests DESC`,
    [hospitalId, from, to]
  );

  const days = Math.max(1, Math.round((to - from) / 86400000));
  res.json({
    rows: result.rows.map((r) => ({ ...r, average_per_day: Math.round((r.total_tests / days) * 10) / 10 })),
  });
});

// GET /api/billing-reports/commission-ledger?from=&to=
router.get('/commission-ledger', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { from, to } = dateRangeParams(req.query);

  const invoices = await loadInvoicesWithTotals(hospitalId, from, to);
  const byDoctor = {};
  for (const inv of invoices) {
    if (!inv.doctor_id) continue;
    byDoctor[inv.doctor_id] = byDoctor[inv.doctor_id] || { doctorId: inv.doctor_id, invoiceCount: 0, revenue: 0 };
    byDoctor[inv.doctor_id].invoiceCount += 1;
    byDoctor[inv.doctor_id].revenue += inv.grandTotal - inv.refund;
  }

  const doctorIds = Object.keys(byDoctor).map(Number);
  if (doctorIds.length === 0) return res.json({ rows: [] });

  const doctorsRes = await pool.query(`SELECT id, full_name, specialization, commission_percent FROM doctors WHERE id = ANY($1::int[]) AND hospital_id = $2`, [doctorIds, hospitalId]);
  const rows = doctorsRes.rows.map((d) => {
    const agg = byDoctor[d.id];
    const commissionAmount = Math.round(agg.revenue * Number(d.commission_percent) / 100 * 100) / 100;
    return {
      doctorId: d.id, doctorName: d.full_name, specialization: d.specialization,
      invoiceCount: agg.invoiceCount, revenue: Math.round(agg.revenue * 100) / 100,
      commissionPercent: Number(d.commission_percent), commissionAmount,
    };
  });

  res.json({ rows: rows.sort((a, b) => b.commissionAmount - a.commissionAmount) });
});

// GET /api/billing-reports/revenue?from=&to=
router.get('/revenue', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { from, to } = dateRangeParams(req.query);

  const invoices = await loadInvoicesWithTotals(hospitalId, from, to);

  const byDay = {};
  const byMode = {};
  for (const inv of invoices) {
    const day = new Date(inv.invoice_date).toISOString().slice(0, 10);
    byDay[day] = byDay[day] || { date: day, billed: 0, collected: 0, refunded: 0 };
    byDay[day].billed += inv.grandTotal;
    byDay[day].collected += inv.paidAmount;
    byDay[day].refunded += inv.refund;

    byMode[inv.payment_mode] = (byMode[inv.payment_mode] || 0) + inv.paidAmount;
  }

  res.json({
    dayPoints: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    modeShare: Object.entries(byMode).map(([mode, amount]) => ({ mode, amount })),
  });
});

// GET /api/billing-reports/due?asOfDate=
router.get('/due', requirePermission('billing.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const asOfDate = parseDate(req.query.asOfDate, 'as-of') || new Date();

  const result = await pool.query(
    `SELECT i.*, p.id AS patient_id, p.full_name AS patient_name, p.uhid AS patient_uhid, p.phone AS contact_number,
            COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount,
            (SELECT MAX(paid_at) FROM payments WHERE invoice_id = i.id) AS last_payment_date
     FROM invoices i JOIN patients p ON p.id = i.patient_id
     WHERE i.hospital_id = $1`,
    [hospitalId]
  );

  const byPatient = {};
  for (const row of result.rows) {
    const totals = computeInvoiceTotals(row, row.paid_amount);
    if (totals.balanceDue <= 0) continue;

    const ageDays = Math.floor((asOfDate - new Date(row.invoice_date)) / 86400000);
    const bucket = ageDays <= 30 ? 'outstanding_0_30' : ageDays <= 60 ? 'outstanding_31_60' : ageDays <= 90 ? 'outstanding_61_90' : 'outstanding_90_plus';

    const key = row.patient_id;
    byPatient[key] = byPatient[key] || {
      patientId: row.patient_id, patientName: row.patient_name, patientUhid: row.patient_uhid, contactNumber: row.contact_number,
      invoiceCount: 0, totalBilled: 0, totalPaid: 0, totalOutstanding: 0,
      outstanding_0_30: 0, outstanding_31_60: 0, outstanding_61_90: 0, outstanding_90_plus: 0,
      oldestInvoiceDate: row.invoice_date, lastPaymentDate: row.last_payment_date,
    };
    const agg = byPatient[key];
    agg.invoiceCount += 1;
    agg.totalBilled += totals.grandTotal;
    agg.totalPaid += totals.paidAmount;
    agg.totalOutstanding += totals.balanceDue;
    agg[bucket] += totals.balanceDue;
    if (new Date(row.invoice_date) < new Date(agg.oldestInvoiceDate)) agg.oldestInvoiceDate = row.invoice_date;
  }

  res.json({ rows: Object.values(byPatient).sort((a, b) => b.totalOutstanding - a.totalOutstanding) });
});

module.exports = router;
