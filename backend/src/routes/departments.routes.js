const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { paramGuard, tooLong } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

// GET /api/departments?search=
router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT d.*, (SELECT COUNT(*) FROM tests t WHERE t.department_id = d.id) AS test_count
     FROM departments d
     WHERE d.hospital_id = $1 AND (d.name ILIKE $2 OR d.code ILIKE $2)
     ORDER BY d.name ASC`,
    [hospitalId, `%${search}%`]
  );
  res.json({ departments: result.rows });
});

// POST /api/departments
router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, code, description } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof code !== 'string') return res.status(400).json({ message: 'Name (max 150) and code are required.' });
  if (tooLong(description, 300)) return res.status(400).json({ message: 'Description can be at most 300 characters.' });
  if (!/^[A-Za-z0-9]{2,10}$/.test(code)) return res.status(400).json({ message: 'Code must be 2-10 alphanumeric characters.' });

  try {
    const result = await pool.query(
      `INSERT INTO departments (hospital_id, name, code, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [hospitalId, name.trim(), code, description]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Department', module: 'Laboratory', details: name, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Department code already exists.' });
    throw err;
  }
});

// PUT /api/departments/:id
router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 150) return res.status(400).json({ message: 'Name is required (max 150 characters).' });
  if (tooLong(description, 300)) return res.status(400).json({ message: 'Description can be at most 300 characters.' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });

  const result = await pool.query(
    `UPDATE departments SET name=$1, description=$2, is_active=COALESCE($3, is_active) WHERE id=$4 AND hospital_id=$5 RETURNING *`,
    [name.trim(), description, isActive ?? null, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Department not found.' });
  res.json(result.rows[0]);
});

// DELETE /api/departments/:id
router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const usageRes = await pool.query(`SELECT COUNT(*) FROM tests WHERE department_id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (Number(usageRes.rows[0].count) > 0) {
    return res.status(400).json({ message: 'Cannot delete a department that has tests assigned to it.' });
  }

  const result = await pool.query(`DELETE FROM departments WHERE id = $1 AND hospital_id = $2 RETURNING name`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Department not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete Department', module: 'Laboratory', details: result.rows[0].name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Department deleted.' });
});

module.exports = router;
