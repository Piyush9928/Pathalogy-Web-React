const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { paramGuard, isInt } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

function sampleTypeError(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return 'Name is required (max 100 characters).';
  if (b.icon !== undefined && b.icon !== null && b.icon !== '' && !/^[a-z0-9-]{1,50}$/i.test(String(b.icon))) return 'Icon must be a short icon class name like bi-flask.';
  if (b.displayOrder !== undefined && b.displayOrder !== null && b.displayOrder !== '' && (!isInt(b.displayOrder) || Math.abs(Number(b.displayOrder)) > 100000)) return 'Display order must be a whole number.';
  if (b.isActive !== undefined && typeof b.isActive !== 'boolean') return 'isActive must be true or false.';
  return null;
}

router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT * FROM sample_types WHERE hospital_id = $1 ORDER BY display_order ASC, name ASC`,
    [hospitalId]
  );
  res.json({ sampleTypes: result.rows });
});

router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, icon, displayOrder } = req.body;
  const sErr = sampleTypeError(req.body);
  if (sErr) return res.status(400).json({ message: sErr });

  const result = await pool.query(
    `INSERT INTO sample_types (hospital_id, name, icon, display_order) VALUES ($1,$2,$3,$4) RETURNING *`,
    [hospitalId, name.trim(), icon || 'bi-flask', Number(displayOrder) || 0]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, icon, displayOrder, isActive } = req.body;
  const sErr = sampleTypeError(req.body);
  if (sErr) return res.status(400).json({ message: sErr });

  const result = await pool.query(
    `UPDATE sample_types SET name=$1, icon=COALESCE($2, icon), display_order=COALESCE($3, display_order), is_active=COALESCE($4, is_active) WHERE id=$5 AND hospital_id=$6 RETURNING *`,
    [name.trim(), icon || null, displayOrder === undefined || displayOrder === '' || displayOrder === null ? null : Number(displayOrder), isActive ?? null, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Sample type not found.' });
  res.json(result.rows[0]);
});

router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const usageRes = await pool.query(`SELECT COUNT(*) FROM tests WHERE sample_type_id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (Number(usageRes.rows[0].count) > 0) {
    return res.status(400).json({ message: 'Cannot delete a sample type used by existing tests.' });
  }

  const result = await pool.query(`DELETE FROM sample_types WHERE id = $1 AND hospital_id = $2 RETURNING id`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Sample type not found.' });
  res.json({ message: 'Sample type deleted.' });
});

module.exports = router;
