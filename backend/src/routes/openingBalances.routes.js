const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isPositiveInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const BALANCE_TYPES = ['Dr', 'Cr'];
const MAX_AMOUNT = 9999999999.99; // fits NUMERIC(12,2), the smallest of the opening-balance columns

// financialYearId arrives in the query string on every GET and is used in a SQL comparison.
router.use((req, res, next) => {
  if (req.query.financialYearId !== undefined && !isPositiveInt(req.query.financialYearId)) {
    return res.status(400).json({ message: 'financialYearId must be a valid id.' });
  }
  next();
});

// Financial years belong to a company, which belongs to a hospital. Returns the row or null.
async function findFinancialYear(hospitalId, id) {
  if (!isPositiveInt(id)) return null;
  const res = await pool.query(
    `SELECT fy.* FROM financial_years fy JOIN companies c ON c.id = fy.company_id WHERE fy.id = $1 AND c.hospital_id = $2`,
    [id, hospitalId]
  );
  return res.rows[0] || null;
}

// Common checks for every opening-balance write: the year must be this hospital's and unlocked.
// Returns an error response sender, or null when fine.
async function checkYearWritable(hospitalId, financialYearId) {
  const fy = await findFinancialYear(hospitalId, financialYearId);
  if (!fy) return { status: 404, message: 'Financial year not found.' };
  if (fy.is_locked) return { status: 409, message: `Financial year ${fy.fin_year} is locked. Opening balances cannot be changed.` };
  return null;
}

// A single table/column family per party type keeps the handlers declarative and the SQL fixed.
const PARTIES = {
  patients: { table: 'patient_opening_balances', fk: 'patient_id', body: 'patientId', owner: 'patients', label: 'patient', defaultType: 'Dr' },
  doctors: { table: 'doctor_opening_balances', fk: 'doctor_id', body: 'doctorId', owner: 'doctors', label: 'doctor', defaultType: 'Cr' },
  suppliers: { table: 'supplier_opening_balances', fk: 'supplier_id', body: 'supplierId', owner: 'suppliers', label: 'supplier', defaultType: 'Cr' },
  accounts: { table: 'account_opening_balances', fk: 'ledger_account_id', body: 'ledgerAccountId', owner: 'ledger_accounts', label: 'ledger account', defaultType: 'Dr' },
};

router.get('/financial-years', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT fy.* FROM financial_years fy JOIN companies c ON c.id = fy.company_id
     WHERE c.hospital_id = $1 ORDER BY fy.from_date DESC`,
    [hospitalId]
  );
  res.json({ financialYears: result.rows });
});

// ---- Party balances (patients, doctors, suppliers, ledger accounts) ----

router.get('/patients', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { financialYearId } = req.query;
  if (!financialYearId) return res.status(400).json({ message: 'financialYearId is required.' });

  const result = await pool.query(
    `SELECT pob.*, p.full_name, p.uhid FROM patient_opening_balances pob JOIN patients p ON p.id = pob.patient_id
     WHERE pob.financial_year_id = $1 AND p.hospital_id = $2 ORDER BY p.full_name ASC`,
    [financialYearId, hospitalId]
  );
  res.json({ balances: result.rows });
});

router.get('/doctors', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { financialYearId } = req.query;
  if (!financialYearId) return res.status(400).json({ message: 'financialYearId is required.' });

  const result = await pool.query(
    `SELECT dob.*, d.full_name FROM doctor_opening_balances dob JOIN doctors d ON d.id = dob.doctor_id
     WHERE dob.financial_year_id = $1 AND d.hospital_id = $2 ORDER BY d.full_name ASC`,
    [financialYearId, hospitalId]
  );
  res.json({ balances: result.rows });
});

router.get('/suppliers', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { financialYearId } = req.query;
  if (!financialYearId) return res.status(400).json({ message: 'financialYearId is required.' });

  const result = await pool.query(
    `SELECT sob.*, s.name FROM supplier_opening_balances sob JOIN suppliers s ON s.id = sob.supplier_id
     WHERE sob.financial_year_id = $1 AND s.hospital_id = $2 ORDER BY s.name ASC`,
    [financialYearId, hospitalId]
  );
  res.json({ balances: result.rows });
});

router.get('/accounts', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { financialYearId } = req.query;
  if (!financialYearId) return res.status(400).json({ message: 'financialYearId is required.' });

  const result = await pool.query(
    `SELECT aob.*, la.name FROM account_opening_balances aob JOIN ledger_accounts la ON la.id = aob.ledger_account_id
     WHERE aob.financial_year_id = $1 AND la.hospital_id = $2 ORDER BY la.name ASC`,
    [financialYearId, hospitalId]
  );
  res.json({ balances: result.rows });
});

for (const [route, p] of Object.entries(PARTIES)) {
  router.post(`/${route}`, requirePermission('accounting.create'), async (req, res) => {
    const { hospitalId, name } = req.user;
    const b = req.body;
    const partyId = b[p.body];
    if (!b.financialYearId || !partyId) return res.status(400).json({ message: `Financial year and ${p.label} are required.` });
    if (b.amount !== undefined && b.amount !== '' && !isMoney(b.amount, MAX_AMOUNT)) {
      return res.status(400).json({ message: 'Amount must be 0 or more (use Dr/Cr for the side).' });
    }
    if (b.balanceType !== undefined && !BALANCE_TYPES.includes(b.balanceType)) return res.status(400).json({ message: 'Balance type must be Dr or Cr.' });

    const blocked = await checkYearWritable(hospitalId, b.financialYearId);
    if (blocked) return res.status(blocked.status).json({ message: blocked.message });
    if (!(await idsBelongToHospital(pool, p.owner, hospitalId, [partyId])) || !isPositiveInt(partyId)) {
      return res.status(404).json({ message: `${p.label[0].toUpperCase()}${p.label.slice(1)} not found.` });
    }

    // table/fk come from the fixed PARTIES map above, never from the request.
    const result = await pool.query(
      `INSERT INTO ${p.table} (financial_year_id, ${p.fk}, amount, balance_type) VALUES ($1,$2,$3,$4)
       ON CONFLICT (financial_year_id, ${p.fk}) DO UPDATE SET amount = EXCLUDED.amount, balance_type = EXCLUDED.balance_type
       RETURNING *`,
      [b.financialYearId, partyId, b.amount || 0, b.balanceType || p.defaultType]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Set Opening Balance', module: 'Accounting', details: `${p.label} #${partyId}: ${b.amount || 0} ${b.balanceType || p.defaultType}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  });
}

// Inventory opening balances carry quantity and rate instead of amount/type.
router.get('/inventory', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { financialYearId } = req.query;
  if (!financialYearId) return res.status(400).json({ message: 'financialYearId is required.' });

  const result = await pool.query(
    `SELECT iob.*, i.name FROM inventory_opening_balances iob JOIN inventory_items i ON i.id = iob.inventory_item_id
     WHERE iob.financial_year_id = $1 AND i.hospital_id = $2 ORDER BY i.name ASC`,
    [financialYearId, hospitalId]
  );
  res.json({ balances: result.rows });
});

router.post('/inventory', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { financialYearId, inventoryItemId, quantity, rate } = req.body;
  if (!financialYearId || !inventoryItemId) return res.status(400).json({ message: 'Financial year and inventory item are required.' });
  if (quantity !== undefined && quantity !== '' && !isMoney(quantity, MAX_AMOUNT)) return res.status(400).json({ message: 'Quantity must be 0 or more.' });
  if (rate !== undefined && rate !== '' && !isMoney(rate)) return res.status(400).json({ message: 'Rate must be 0 or more.' });

  const blocked = await checkYearWritable(hospitalId, financialYearId);
  if (blocked) return res.status(blocked.status).json({ message: blocked.message });
  if (!isPositiveInt(inventoryItemId) || !(await idsBelongToHospital(pool, 'inventory_items', hospitalId, [inventoryItemId]))) {
    return res.status(404).json({ message: 'Inventory item not found.' });
  }

  const result = await pool.query(
    `INSERT INTO inventory_opening_balances (financial_year_id, inventory_item_id, quantity, rate) VALUES ($1,$2,$3,$4)
     ON CONFLICT (financial_year_id, inventory_item_id) DO UPDATE SET quantity = EXCLUDED.quantity, rate = EXCLUDED.rate
     RETURNING *`,
    [financialYearId, inventoryItemId, quantity || 0, rate || 0]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Set Opening Balance', module: 'Accounting', details: `inventory item #${inventoryItemId}: ${quantity || 0} @ ${rate || 0}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

// ---- Deletes: scoped through financial year -> company -> hospital, and blocked in a locked year ----

const DELETABLE = { ...Object.fromEntries(Object.entries(PARTIES).map(([route, p]) => [route, p.table])), inventory: 'inventory_opening_balances' };

for (const [route, table] of Object.entries(DELETABLE)) {
  router.delete(`/${route}/:id`, requirePermission('accounting.delete'), async (req, res) => {
    const { hospitalId, name } = req.user;
    const { id } = req.params;
    if (!isPositiveInt(id)) return res.status(404).json({ message: 'Opening balance not found.' });

    const found = await pool.query(
      `SELECT x.id, fy.is_locked, fy.fin_year FROM ${table} x
       JOIN financial_years fy ON fy.id = x.financial_year_id JOIN companies c ON c.id = fy.company_id
       WHERE x.id = $1 AND c.hospital_id = $2`,
      [id, hospitalId]
    );
    if (!found.rows[0]) return res.status(404).json({ message: 'Opening balance not found.' });
    if (found.rows[0].is_locked) return res.status(409).json({ message: `Financial year ${found.rows[0].fin_year} is locked. Opening balances cannot be changed.` });

    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Opening Balance', module: 'Accounting', details: `${route} #${id}`, severity: 'Warning', ip: req.ip });
    res.json({ message: 'Opening balance deleted.' });
  });
}

module.exports = router;
