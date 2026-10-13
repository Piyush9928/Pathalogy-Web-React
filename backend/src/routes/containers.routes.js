const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { paramGuard, tooLong, isInt } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

// Returns an error message or null; shared by create and update.
function containerError(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return 'Name is required (max 100 characters).';
  if (b.capColor && !Object.keys(CAP_COLOR_HEX).includes(b.capColor)) return 'Invalid cap color.';
  if (tooLong(b.containerCode, 30) || tooLong(b.sampleType, 100) || tooLong(b.sampleUses, 200) || tooLong(b.additive, 100) || tooLong(b.remark, 300)) {
    return 'A field is too long (code 30, sample type 100, uses 200, additive 100, remark 300).';
  }
  if (b.containerColorHex && !/^#[0-9A-Fa-f]{3,8}$/.test(String(b.containerColorHex))) return 'Color must be a hex value like #ff0000.';
  if (b.displayOrder !== undefined && b.displayOrder !== null && b.displayOrder !== '' && (!isInt(b.displayOrder) || Math.abs(Number(b.displayOrder)) > 100000)) return 'Display order must be a whole number.';
  if (b.isActive !== undefined && typeof b.isActive !== 'boolean') return 'isActive must be true or false.';
  return null;
}

const CAP_COLOR_HEX = {
  Purple: '#8b5cf6', Red: '#ef4444', Yellow: '#eab308',
  Green: '#22c55e', Blue: '#3b82f6', Grey: '#9ca3af', Plain: '#e5e7eb',
};

function withColorHex(row) {
  return { ...row, color_hex: row.container_color_hex || CAP_COLOR_HEX[row.cap_color] || CAP_COLOR_HEX.Plain };
}

router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT * FROM containers WHERE hospital_id = $1 ORDER BY display_order ASC, name ASC`,
    [hospitalId]
  );
  res.json({ containers: result.rows.map(withColorHex) });
});

router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, capColor, containerCode, sampleType, containerColorHex, sampleUses, additive, remark, displayOrder } = req.body;
  const cErr = containerError(req.body);
  if (cErr) return res.status(400).json({ message: cErr });

  const result = await pool.query(
    `INSERT INTO containers (hospital_id, name, cap_color, container_code, sample_type, container_color_hex, sample_uses, additive, remark, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [hospitalId, name.trim(), capColor || 'Plain', containerCode, sampleType, containerColorHex || null, sampleUses, additive, remark, Number(displayOrder) || 0]
  );
  res.status(201).json(withColorHex(result.rows[0]));
});

router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, capColor, containerCode, sampleType, containerColorHex, sampleUses, additive, remark, displayOrder, isActive } = req.body;
  const cErr = containerError(req.body);
  if (cErr) return res.status(400).json({ message: cErr });

  const result = await pool.query(
    `UPDATE containers SET name=$1, cap_color=COALESCE($2, cap_color), container_code=$3, sample_type=$4, container_color_hex=$5,
       sample_uses=$6, additive=$7, remark=$8, display_order=COALESCE($9, display_order), is_active=COALESCE($10, is_active)
     WHERE id=$11 AND hospital_id=$12 RETURNING *`,
    [name.trim(), capColor || null, containerCode, sampleType, containerColorHex || null, sampleUses, additive, remark,
      displayOrder === undefined || displayOrder === '' || displayOrder === null ? null : Number(displayOrder), isActive ?? null, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Container not found.' });
  res.json(withColorHex(result.rows[0]));
});

router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const usageRes = await pool.query(`SELECT COUNT(*) FROM tests WHERE container_id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (Number(usageRes.rows[0].count) > 0) {
    return res.status(400).json({ message: 'Cannot delete a container used by existing tests.' });
  }

  const result = await pool.query(`DELETE FROM containers WHERE id = $1 AND hospital_id = $2 RETURNING id`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Container not found.' });
  res.json({ message: 'Container deleted.' });
});

module.exports = router;
