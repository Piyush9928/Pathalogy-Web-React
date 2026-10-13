const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { paramGuard, tooLong, EMAIL_RE, PHONE_RE } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

const BRANCH_TYPES = ['Main Lab', 'Branch Lab', 'Collection Center'];

// Returns an error message or null. `partial` is false for both create and full update.
function branchError(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 150) return 'Name is required (max 150 characters).';
  if (b.branchType && !BRANCH_TYPES.includes(b.branchType)) return 'Invalid branch type.';
  if (tooLong(b.address, 300) || tooLong(b.city, 100) || tooLong(b.state, 100) || tooLong(b.pincode, 20) || tooLong(b.gstin, 20) || tooLong(b.workingHours, 50)) {
    return 'A field is too long (address 300, city/state 100, pincode/gstin 20, working hours 50).';
  }
  if (b.phone && !PHONE_RE.test(String(b.phone))) return 'Phone number is invalid.';
  if (b.email && (!EMAIL_RE.test(String(b.email)) || String(b.email).length > 150)) return 'Email is invalid.';
  return null;
}

// GET /api/branches?search=&status=
router.get('/', requirePermission('branches.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT * FROM branches WHERE hospital_id = $1
       AND (name ILIKE $2 OR code ILIKE $2 OR city ILIKE $2)
     ORDER BY is_primary DESC, name ASC`,
    [hospitalId, `%${search}%`]
  );

  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_active) AS active,
       COUNT(*) FILTER (WHERE branch_type = 'Collection Center') AS collection_centers,
       COUNT(DISTINCT city) AS cities
     FROM branches WHERE hospital_id = $1`,
    [hospitalId]
  );

  res.json({ branches: result.rows, stats: stats.rows[0] });
});

// POST /api/branches
router.post('/', requirePermission('branches.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, code, address, city, state, pincode, phone, email, gstin, branchType, workingHours } = req.body;

  if (typeof code !== 'string' || !code.trim() || code.length > 30) return res.status(400).json({ message: 'Code is required (max 30 characters).' });
  const err1 = branchError(req.body);
  if (err1) return res.status(400).json({ message: err1 });

  try {
    const result = await pool.query(
      `INSERT INTO branches (hospital_id, name, code, address, city, state, pincode, phone, email, gstin, branch_type, working_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [hospitalId, name.trim(), code.trim(), address, city, state, pincode, phone, email, gstin, branchType || 'Branch Lab', workingHours || '08:00 - 20:00']
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Branch', module: 'Branches', details: `Created branch ${name}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Branch code already exists.' });
    throw err;
  }
});

// PUT /api/branches/:id
router.put('/:id', requirePermission('branches.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, address, city, state, pincode, phone, email, gstin, branchType, workingHours } = req.body;
  const err2 = branchError(req.body);
  if (err2) return res.status(400).json({ message: err2 });

  const result = await pool.query(
    `UPDATE branches SET name=$1, address=$2, city=$3, state=$4, pincode=$5, phone=$6, email=$7, gstin=$8, branch_type=$9, working_hours=$10
     WHERE id = $11 AND hospital_id = $12 RETURNING *`,
    [name.trim(), address, city, state, pincode, phone, email, gstin, branchType || 'Branch Lab', workingHours || '08:00 - 20:00', id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Branch not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit Branch', module: 'Branches', details: `Edited branch ${name}`, ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/branches/:id/active  { isActive }
router.patch('/:id/active', requirePermission('branches.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });

  const branchRes = await pool.query(`SELECT * FROM branches WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  const branch = branchRes.rows[0];
  if (!branch) return res.status(404).json({ message: 'Branch not found.' });
  if (branch.is_primary && !isActive) {
    return res.status(400).json({ message: 'Cannot deactivate the primary branch.' });
  }

  const result = await pool.query(`UPDATE branches SET is_active = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`, [isActive, id, hospitalId]);
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: isActive ? 'Activate Branch' : 'Deactivate Branch', module: 'Branches', details: `${branch.name}`, ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/branches/:id/primary
router.patch('/:id/primary', requirePermission('branches.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1003, hospitalId]); // serialise primary switches per hospital
    await client.query(`UPDATE branches SET is_primary = FALSE WHERE hospital_id = $1`, [hospitalId]);
    const result = await client.query(
      `UPDATE branches SET is_primary = TRUE, is_active = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [id, hospitalId]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Branch not found.' });
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
