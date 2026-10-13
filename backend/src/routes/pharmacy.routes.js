const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { planFefoDeduction, applyFefoDeduction } = require('../utils/pharmacyFefo');
const { generateSaleNumber, generatePurchaseNumber } = require('../utils/pharmacyNumbers');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'];
const UNITS = ['Strip', 'Bottle', 'Vial', 'Tube', 'Box', 'Nos'];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque'];
const SCHEDULE_TYPES = ['Schedule H1', 'Schedule X', 'Narcotic Drugs (NDPS)'];

async function withItemComputed(client, item) {
  const batchesRes = await client.query(`SELECT * FROM medicine_batches WHERE medicine_item_id = $1 ORDER BY expiry_date ASC`, [item.id]);
  const batches = batchesRes.rows;
  const now = new Date();
  const currentStock = batches.reduce((sum, b) => sum + b.quantity, 0);
  const hasExpiredBatch = batches.some((b) => new Date(b.expiry_date) < now);
  const hasExpiringBatch = batches.some((b) => new Date(b.expiry_date) >= now && new Date(b.expiry_date) <= new Date(now.getTime() + 60 * 86400000));
  const stockValue = batches.reduce((sum, b) => sum + b.quantity * Number(b.purchase_rate), 0);
  const withStock = batches.filter((b) => b.quantity > 0);
  const latestMrp = withStock.length > 0
    ? withStock.reduce((latest, b) => (new Date(b.expiry_date) > new Date(latest.expiry_date) ? b : latest)).mrp
    : item.mrp;

  return {
    ...item, batches, current_stock: currentStock, is_low_stock: currentStock <= item.minimum_stock,
    has_expired_batch: hasExpiredBatch, has_expiring_batch: hasExpiringBatch, stock_value: stockValue, latest_mrp: latestMrp,
  };
}

const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const isMoney = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0;

// Every medicineItemId on a request must belong to the caller's hospital (ids are global serials).
async function allItemsBelongToHospital(client, hospitalId, lines) {
  const ids = [...new Set(lines.map((l) => Number(l.medicineItemId)))];
  if (ids.some((id) => !Number.isInteger(id))) return false;
  const res = await client.query(`SELECT COUNT(*)::int AS n FROM medicine_items WHERE hospital_id = $1 AND id = ANY($2::int[])`, [hospitalId, ids]);
  return res.rows[0].n === ids.length;
}

// ==================== Medicine Items ====================

router.get('/items', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT * FROM medicine_items WHERE hospital_id = $1 AND (name ILIKE $2 OR item_code ILIKE $2) ORDER BY name ASC`,
    [hospitalId, `%${search}%`]
  );
  const items = await Promise.all(result.rows.map((item) => withItemComputed(pool, item)));

  res.json({
    items,
    stats: {
      totalItems: items.length,
      lowStock: items.filter((i) => i.is_low_stock).length,
      expiredBatches: items.filter((i) => i.has_expired_batch).length,
      totalStockValue: items.reduce((sum, i) => sum + i.stock_value, 0),
    },
    categories: CATEGORIES, units: UNITS,
  });
});

router.get('/items/autocomplete', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { q = '' } = req.query;
  const result = await pool.query(
    `SELECT * FROM medicine_items WHERE hospital_id = $1 AND is_active = TRUE AND (name ILIKE $2 OR item_code ILIKE $2) ORDER BY name ASC LIMIT 15`,
    [hospitalId, `%${q}%`]
  );
  const items = await Promise.all(result.rows.map((item) => withItemComputed(pool, item)));
  res.json({ items });
});

router.get('/items/:id', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM medicine_items WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Medicine item not found.' });
  res.json(await withItemComputed(pool, result.rows[0]));
});

router.post('/items', requirePermission('pharmacy.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.itemCode || !b.name) return res.status(400).json({ message: 'Item code and name are required.' });

  try {
    const result = await pool.query(
      `INSERT INTO medicine_items (hospital_id, item_code, name, category, manufacturer, hsn_id, gst_percent, unit, minimum_stock, mrp, packing, salt_id, brand_type, make_id, remark, is_tax_exempt, is_insurance_item, retail_reorder_level, store_reorder_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        hospitalId, b.itemCode, b.name, b.category || 'Tablet', b.manufacturer, b.hsnId || null, b.gstPercent || 0, b.unit || 'Strip',
        b.minimumStock || 0, b.mrp || 0, b.packing || null, b.saltId || null, b.brandType || 'Branded', b.makeId || null,
        b.remark, b.isTaxExempt || false, b.isInsuranceItem || false, b.retailReorderLevel || null, b.storeReorderLevel || null,
      ]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Medicine Item', module: 'Pharmacy', details: `${b.itemCode} - ${b.name}`, ip: req.ip });
    res.status(201).json(await withItemComputed(pool, result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Item code already exists.' });
    throw err;
  }
});

router.put('/items/:id', requirePermission('pharmacy.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;

  const result = await pool.query(
    `UPDATE medicine_items SET item_code=$1, name=$2, category=$3, manufacturer=$4, hsn_id=$5, gst_percent=$6, unit=$7, minimum_stock=$8,
       mrp=$9, packing=$10, salt_id=$11, brand_type=$12, make_id=$13, remark=$14, is_tax_exempt=$15, is_insurance_item=$16,
       retail_reorder_level=$17, store_reorder_level=$18, is_active=$19
     WHERE id=$20 AND hospital_id=$21 RETURNING *`,
    [
      b.itemCode, b.name, b.category, b.manufacturer, b.hsnId || null, b.gstPercent, b.unit, b.minimumStock,
      b.mrp, b.packing || null, b.saltId || null, b.brandType, b.makeId || null, b.remark, b.isTaxExempt, b.isInsuranceItem,
      b.retailReorderLevel || null, b.storeReorderLevel || null, b.isActive ?? true, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Medicine item not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Medicine Item', module: 'Pharmacy', details: `${b.itemCode} - ${b.name}`, ip: req.ip });
  res.json(await withItemComputed(pool, result.rows[0]));
});

router.delete('/items/:id', requirePermission('pharmacy.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM medicine_items WHERE id = $1 AND hospital_id = $2 RETURNING item_code, name`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Medicine item not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Medicine Item', module: 'Pharmacy', details: `${result.rows[0].item_code} - ${result.rows[0].name}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Medicine item deleted.' });
});

// ==================== Purchases (batch receiving) ====================

router.get('/purchases', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM medicine_purchases WHERE hospital_id = $1 ORDER BY purchase_date DESC`, [hospitalId]);
  const withLines = await Promise.all(result.rows.map(async (p) => {
    const lines = await pool.query(`SELECT pl.*, mi.name AS item_name FROM medicine_purchase_lines pl JOIN medicine_items mi ON mi.id = pl.medicine_item_id WHERE pl.purchase_id = $1`, [p.id]);
    return { ...p, lines: lines.rows };
  }));
  res.json({ purchases: withLines });
});

router.post('/purchases', requirePermission('pharmacy.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { supplier, invoiceNo, lines = [] } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: 'Add at least one line item.' });

  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    if (!String(line.batchNo || '').trim()) return res.status(400).json({ message: `Line ${n}: batch number is required.` });
    if (!line.expiryDate || Number.isNaN(Date.parse(line.expiryDate))) return res.status(400).json({ message: `Line ${n}: a valid expiry date is required.` });
    if (!isPositiveInt(line.quantity)) return res.status(400).json({ message: `Line ${n}: quantity must be a whole number greater than 0.` });
    if (!isMoney(line.purchaseRate) || !isMoney(line.mrp)) return res.status(400).json({ message: `Line ${n}: purchase rate and MRP must be 0 or more.` });
  }
  if (!(await allItemsBelongToHospital(pool, hospitalId, lines))) {
    return res.status(400).json({ message: 'One or more medicine items were not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const purchaseNumber = await generatePurchaseNumber(client);
    const purchaseRes = await client.query(
      `INSERT INTO medicine_purchases (hospital_id, purchase_number, supplier, invoice_no, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [hospitalId, purchaseNumber, supplier, invoiceNo, name]
    );
    const purchase = purchaseRes.rows[0];

    for (const line of lines) {
      const batchRes = await client.query(
        `INSERT INTO medicine_batches (medicine_item_id, batch_no, expiry_date, quantity, purchase_rate, mrp) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [line.medicineItemId, line.batchNo, line.expiryDate, line.quantity, line.purchaseRate, line.mrp]
      );
      await client.query(
        `INSERT INTO medicine_purchase_lines (purchase_id, medicine_item_id, batch_id, batch_no, expiry_date, quantity, purchase_rate, mrp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [purchase.id, line.medicineItemId, batchRes.rows[0].id, line.batchNo, line.expiryDate, line.quantity, line.purchaseRate, line.mrp]
      );
    }
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Receive Medicine Purchase', module: 'Pharmacy', details: `${purchaseNumber} (${lines.length} lines)`, ip: req.ip });
    res.status(201).json(purchase);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Sales (POS) ====================

router.get('/sales', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT ms.*, p.full_name AS patient_name, p.uhid AS patient_uhid FROM medicine_sales ms
     LEFT JOIN patients p ON p.id = ms.patient_id
     WHERE ms.hospital_id = $1 AND (ms.sale_number ILIKE $2 OR COALESCE(p.full_name, ms.walk_in_name) ILIKE $2)
     ORDER BY ms.sale_date DESC`,
    [hospitalId, `%${search}%`]
  );

  const today = new Date().toISOString().slice(0, 10);
  const todaysSales = result.rows.filter((s) => new Date(s.sale_date).toISOString().slice(0, 10) === today);

  res.json({
    sales: result.rows,
    todaysTotal: todaysSales.reduce((sum, s) => sum + Number(s.paid_amount), 0),
    paymentModes: PAYMENT_MODES,
  });
});

router.get('/sales/:id', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const saleRes = await pool.query(
    `SELECT ms.*, p.full_name AS patient_name, p.uhid AS patient_uhid FROM medicine_sales ms
     LEFT JOIN patients p ON p.id = ms.patient_id WHERE ms.id = $1 AND ms.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!saleRes.rows[0]) return res.status(404).json({ message: 'Sale not found.' });

  const linesRes = await pool.query(
    `SELECT sl.*, mi.name AS item_name FROM medicine_sale_lines sl JOIN medicine_items mi ON mi.id = sl.medicine_item_id WHERE sl.sale_id = $1`,
    [id]
  );
  const linesWithBatches = await Promise.all(linesRes.rows.map(async (line) => {
    const batches = await pool.query(`SELECT slb.*, mb.batch_no FROM sale_line_batches slb JOIN medicine_batches mb ON mb.id = slb.batch_id WHERE slb.sale_line_id = $1`, [line.id]);
    return { ...line, batchesUsed: batches.rows };
  }));

  res.json({ sale: saleRes.rows[0], lines: linesWithBatches });
});

// POST /api/pharmacy/sales { patientId?, walkInName?, discountMasterId?, paymentMode, paidAmount, doctorsName?, lines: [{medicineItemId, quantity}] }
router.post('/sales', requirePermission('pharmacy.sell'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!Array.isArray(b.lines) || b.lines.length === 0) return res.status(400).json({ message: 'Add at least one item to the cart.' });

  for (const [i, line] of b.lines.entries()) {
    if (!isPositiveInt(line.quantity)) return res.status(400).json({ message: `Line ${i + 1}: quantity must be a whole number greater than 0.` });
    if (line.discountPercent !== undefined && !(Number(line.discountPercent) >= 0 && Number(line.discountPercent) <= 100)) {
      return res.status(400).json({ message: `Line ${i + 1}: discount must be between 0 and 100.` });
    }
  }
  if (b.paidAmount !== undefined && !isMoney(b.paidAmount)) return res.status(400).json({ message: 'Paid amount must be 0 or more.' });
  if (b.paymentMode && !PAYMENT_MODES.includes(b.paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (!(await allItemsBelongToHospital(pool, hospitalId, b.lines))) {
    return res.status(400).json({ message: 'One or more medicine items were not found.' });
  }
  if (b.patientId) {
    const pt = await pool.query(`SELECT 1 FROM patients WHERE id = $1 AND hospital_id = $2`, [b.patientId, hospitalId]);
    if (!pt.rows[0]) return res.status(400).json({ message: 'Patient not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Plan FEFO deduction up front - all-or-nothing, matches the original exactly.
    const planResult = await planFefoDeduction(client, b.lines);
    if (!planResult.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Insufficient stock for one or more items.', shortages: planResult.shortages });
    }

    // Resolve discount percent
    let discountPercent = 0;
    if (b.discountMasterId) {
      const discRes = await client.query(`SELECT percent FROM discount_masters WHERE id = $1`, [b.discountMasterId]);
      discountPercent = discRes.rows[0] ? Number(discRes.rows[0].percent) : 0;
    }

    const saleNumber = await generateSaleNumber(client);
    const saleRes = await client.query(
      `INSERT INTO medicine_sales (hospital_id, sale_number, patient_id, walk_in_name, discount_master_id, discount_percent, paid_amount, payment_mode, doctors_name, card_receipt_no, round_off, store_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        hospitalId, saleNumber, b.patientId || null, b.walkInName || 'Walk-in Customer', b.discountMasterId || null, discountPercent,
        b.paidAmount || 0, b.paymentMode || 'Cash', b.doctorsName || null, b.cardReceiptNo || null, b.roundOff || 0, b.storeId || null, name,
      ]
    );
    const sale = saleRes.rows[0];

    for (let i = 0; i < b.lines.length; i++) {
      const line = b.lines[i];
      const itemRes = await client.query(`SELECT * FROM medicine_items WHERE id = $1`, [line.medicineItemId]);
      const item = itemRes.rows[0];
      const withStock = await withItemComputed(client, item);

      const lineRes = await client.query(
        `INSERT INTO medicine_sale_lines (sale_id, medicine_item_id, quantity, mrp, rate, gst_percent, discount_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [sale.id, line.medicineItemId, line.quantity, withStock.latest_mrp, withStock.latest_mrp, item.gst_percent, line.discountPercent || 0]
      );

      for (const consumed of planResult.plan[i]) {
        await client.query(`INSERT INTO sale_line_batches (sale_line_id, batch_id, quantity_taken) VALUES ($1,$2,$3)`, [lineRes.rows[0].id, consumed.batchId, consumed.quantityTaken]);
      }
    }

    await applyFefoDeduction(client, planResult.plan);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Pharmacy Sale', module: 'Pharmacy', details: `${saleNumber}: ${b.lines.length} item(s)`, ip: req.ip });
    res.status(201).json(sale);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Narcotics Register ====================

router.get('/narcotics-register', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;
  const result = await pool.query(
    `SELECT * FROM narcotics_register_entries WHERE hospital_id = $1 AND (drug_name ILIKE $2 OR patient_name ILIKE $2) ORDER BY entry_date DESC`,
    [hospitalId, `%${search}%`]
  );
  res.json({ entries: result.rows.map((e) => ({ ...e, closing_stock: e.opening_stock - e.quantity_dispensed })), scheduleTypes: SCHEDULE_TYPES });
});

router.post('/narcotics-register', requirePermission('pharmacy.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.drugName) return res.status(400).json({ message: 'Drug name is required.' });

  const result = await pool.query(
    `INSERT INTO narcotics_register_entries (hospital_id, entry_date, drug_name, batch_number, schedule_type, patient_name, patient_uhid, patient_address, prescribing_doctor, doctor_reg_number, opening_stock, quantity_dispensed, dispensed_by_pharmacist, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      hospitalId, b.entryDate || new Date(), b.drugName, b.batchNumber, b.scheduleType || 'Schedule H1', b.patientName, b.patientUhid,
      b.patientAddress, b.prescribingDoctor, b.doctorRegNumber, b.openingStock || 0, b.quantityDispensed || 0, b.dispensedByPharmacist || name, b.remarks,
    ]
  );

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Narcotics Register Entry', module: 'Pharmacy', details: `${b.drugName} for ${b.patientName || 'unknown'}`, severity: 'Warning', ip: req.ip });
  res.status(201).json({ ...result.rows[0], closing_stock: result.rows[0].opening_stock - result.rows[0].quantity_dispensed });
});

// ==================== Reports ====================

router.get('/reports/stock-balance', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT mb.*, mi.name AS item_name, mi.item_code FROM medicine_batches mb
     JOIN medicine_items mi ON mi.id = mb.medicine_item_id
     WHERE mi.hospital_id = $1 AND mb.quantity > 0 ORDER BY mi.name ASC, mb.expiry_date ASC`,
    [hospitalId]
  );
  const rows = result.rows.map((r) => ({ ...r, value: r.quantity * Number(r.purchase_rate) }));
  res.json({
    rows,
    totals: {
      totalQuantity: rows.reduce((s, r) => s + r.quantity, 0),
      totalValue: rows.reduce((s, r) => s + r.value, 0),
      expiredCount: rows.filter((r) => new Date(r.expiry_date) < new Date()).length,
      expiringCount: rows.filter((r) => new Date(r.expiry_date) >= new Date() && new Date(r.expiry_date) <= new Date(Date.now() + 60 * 86400000)).length,
    },
  });
});

router.get('/reports/expiry', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT mb.*, mi.name AS item_name, mi.item_code FROM medicine_batches mb
     JOIN medicine_items mi ON mi.id = mb.medicine_item_id WHERE mi.hospital_id = $1 AND mb.quantity > 0`,
    [hospitalId]
  );

  const today = new Date();
  const rows = result.rows.map((r) => {
    const daysToExpiry = Math.ceil((new Date(r.expiry_date) - today) / 86400000);
    let bucket;
    if (daysToExpiry < 0) bucket = 'Already Expired';
    else if (daysToExpiry <= 30) bucket = '0-30 Days';
    else if (daysToExpiry <= 60) bucket = '31-60 Days';
    else if (daysToExpiry <= 90) bucket = '61-90 Days';
    else bucket = '90+ Days';
    return { ...r, days_to_expiry: daysToExpiry, bucket };
  });

  res.json({ rows: rows.sort((a, b) => a.days_to_expiry - b.days_to_expiry) });
});

router.get('/reports/sales-register', requirePermission('pharmacy.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date();

  const result = await pool.query(
    `SELECT sl.*, mi.name AS item_name, ms.sale_number, ms.sale_date
     FROM medicine_sale_lines sl
     JOIN medicine_items mi ON mi.id = sl.medicine_item_id
     JOIN medicine_sales ms ON ms.id = sl.sale_id
     WHERE ms.hospital_id = $1 AND ms.sale_date BETWEEN $2 AND $3 AND ms.is_cancelled = FALSE`,
    [hospitalId, from, to]
  );

  const rows = result.rows.map((r) => {
    const grossAmount = r.quantity * Number(r.rate);
    const discountAmount = Math.round(grossAmount * Number(r.discount_percent) / 100 * 100) / 100;
    const taxable = grossAmount - discountAmount;
    const gstAmount = Math.round(taxable * Number(r.gst_percent) / 100 * 100) / 100;
    const netAmount = taxable + gstAmount;
    return { ...r, grossAmount, discountAmount, gstAmount, netAmount };
  });

  const saleCount = new Set(rows.map((r) => r.sale_number)).size;
  res.json({
    rows,
    totals: {
      saleCount, lineCount: rows.length,
      grossAmount: rows.reduce((s, r) => s + r.grossAmount, 0),
      discountAmount: rows.reduce((s, r) => s + r.discountAmount, 0),
      gstAmount: rows.reduce((s, r) => s + r.gstAmount, 0),
      netAmount: rows.reduce((s, r) => s + r.netAmount, 0),
    },
  });
});

module.exports = router;
