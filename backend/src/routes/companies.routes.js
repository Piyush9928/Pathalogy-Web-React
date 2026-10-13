const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { paramGuard, tooLong, isPositiveInt, isDateString, EMAIL_RE, PHONE_RE } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id', 'companyId', 'branchId');

router.get('/', requirePermission('company.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const companiesRes = await pool.query(`SELECT * FROM companies WHERE hospital_id = $1 ORDER BY display_order ASC, name ASC`, [hospitalId]);

  const companies = [];
  for (const company of companiesRes.rows) {
    const yearsRes = await pool.query(`SELECT * FROM financial_years WHERE company_id = $1 ORDER BY from_date DESC`, [company.id]);
    const branchesRes = await pool.query(`SELECT id, name, code FROM branches WHERE company_id = $1`, [company.id]);
    companies.push({ ...company, financialYears: yearsRes.rows, branches: branchesRes.rows });
  }
  res.json({ companies });
});

router.post('/', requirePermission('company.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200 || typeof b.code !== 'string' || !b.code.trim() || b.code.length > 30) {
    return res.status(400).json({ message: 'Name (max 200) and code (max 30) are required.' });
  }
  if (tooLong(b.gstin, 20) || tooLong(b.address, 300) || tooLong(b.website, 150) || tooLong(b.registrationNo, 50) || tooLong(b.currencySymbol, 10)) {
    return res.status(400).json({ message: 'A field is too long (gstin 20, address 300, website 150, registration no 50, currency 10).' });
  }
  if (b.phone && !PHONE_RE.test(String(b.phone))) return res.status(400).json({ message: 'Phone number is invalid.' });
  if (b.email && (!EMAIL_RE.test(String(b.email)) || String(b.email).length > 150)) return res.status(400).json({ message: 'Email is invalid.' });

  try {
    const result = await pool.query(
      `INSERT INTO companies (hospital_id, name, code, gstin, address, phone, email, website, registration_no, currency_symbol)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [hospitalId, b.name.trim(), b.code.trim(), b.gstin || null, b.address || null, b.phone || null, b.email || null, b.website || null, b.registrationNo || null, b.currencySymbol || '₹']
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Company', module: 'Company', details: b.name, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Company code already exists.' });
    throw err;
  }
});

router.patch('/:id/set-default', requirePermission('company.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1004, hospitalId]);
    await client.query(`UPDATE companies SET is_default = FALSE WHERE hospital_id = $1`, [hospitalId]);
    const result = await client.query(`UPDATE companies SET is_default = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Company not found.' });
    }
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Set Default Company', module: 'Company', details: result.rows[0].name, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Financial Years ====================

router.post('/:companyId/financial-years', requirePermission('company.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { companyId } = req.params;
  const { finYear, fromDate, toDate } = req.body;
  if (typeof finYear !== 'string' || !finYear.trim() || finYear.length > 10 || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Financial year label (max 10 characters), from date, and to date are required.' });
  }
  if (!isDateString(String(fromDate)) || !isDateString(String(toDate))) return res.status(400).json({ message: 'Invalid from / to date.' });
  if (Date.parse(toDate) <= Date.parse(fromDate)) return res.status(400).json({ message: 'To date must be after the from date.' });
  if (Date.parse(toDate) - Date.parse(fromDate) > 400 * 86400000) return res.status(400).json({ message: 'A financial year cannot be longer than about 13 months.' });

  const companyRes = await pool.query(`SELECT * FROM companies WHERE id = $1 AND hospital_id = $2`, [companyId, hospitalId]);
  if (!companyRes.rows[0]) return res.status(404).json({ message: 'Company not found.' });

  // Years of one company must not overlap (a date would otherwise belong to two years, and lock checks become ambiguous).
  const overlap = await pool.query(
    `SELECT fin_year FROM financial_years WHERE company_id = $1 AND from_date <= $3::date AND to_date >= $2::date LIMIT 1`,
    [companyId, fromDate, toDate]
  );
  if (overlap.rows[0]) return res.status(409).json({ message: `These dates overlap the existing financial year ${overlap.rows[0].fin_year}.` });

  try {
    const result = await pool.query(
      `INSERT INTO financial_years (company_id, fin_year, from_date, to_date) VALUES ($1,$2,$3,$4) RETURNING *`,
      [companyId, finYear, fromDate, toDate]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Financial Year', module: 'Company', details: `${companyRes.rows[0].name}: FY ${finYear}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'This financial year already exists for the company.' });
    throw err;
  }
});

router.patch('/financial-years/:id/set-current', requirePermission('company.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const yearRes = await client.query(
      `SELECT fy.* FROM financial_years fy JOIN companies c ON c.id = fy.company_id WHERE fy.id = $1 AND c.hospital_id = $2`,
      [id, hospitalId]
    );
    const year = yearRes.rows[0];
    if (!year) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Financial year not found.' });
    }

    await client.query(`UPDATE financial_years SET is_current = FALSE WHERE company_id = $1`, [year.company_id]);
    const result = await client.query(`UPDATE financial_years SET is_current = TRUE WHERE id = $1 RETURNING *`, [id]);
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Set Current Financial Year', module: 'Company', details: `FY ${result.rows[0].fin_year}`, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/companies/financial-years/:id/lock { isLocked }
// Real lock/unlock: a locked year rejects further voucher postings (enforced in
// accounting.routes.js's POST /vouchers), matching the original exactly.
router.patch('/financial-years/:id/lock', requirePermission('company.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { isLocked = true } = req.body;
  if (typeof isLocked !== 'boolean') return res.status(400).json({ message: 'isLocked must be true or false.' });

  const result = await pool.query(
    `UPDATE financial_years SET is_locked = $1 WHERE id = $2 AND company_id IN (SELECT id FROM companies WHERE hospital_id = $3) RETURNING *`,
    [isLocked, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Financial year not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: isLocked ? 'Lock Financial Year' : 'Unlock Financial Year', module: 'Company', details: `FY ${result.rows[0].fin_year}`, severity: isLocked ? 'Warning' : 'Info', ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/companies/branches/:branchId/company { companyId } - assign a branch to a company
router.patch('/branches/:branchId/company', requirePermission('company.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { branchId } = req.params;
  const { companyId } = req.body;
  if (companyId && !isPositiveInt(companyId)) return res.status(400).json({ message: 'Invalid company.' });
  if (companyId) {
    // company ids are global serials: the company must belong to this hospital too
    const own = await pool.query(`SELECT 1 FROM companies WHERE id = $1 AND hospital_id = $2`, [companyId, hospitalId]);
    if (!own.rows[0]) return res.status(404).json({ message: 'Company not found.' });
  }

  const result = await pool.query(
    `UPDATE branches SET company_id = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`,
    [companyId || null, branchId, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Branch not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Assign Branch to Company', module: 'Company', details: result.rows[0].name, ip: req.ip });
  res.json(result.rows[0]);
});

module.exports = router;
