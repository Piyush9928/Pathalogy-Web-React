const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { paramGuard, tooLong, EMAIL_RE, PHONE_RE } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

function supplierError(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 150) return 'Name is required (max 150 characters).';
  if (tooLong(b.contactPerson, 150) || tooLong(b.address, 300) || tooLong(b.gstin, 20)) return 'A field is too long (contact 150, address 300, gstin 20).';
  if (b.phone && !PHONE_RE.test(String(b.phone))) return 'Phone number is invalid.';
  if (b.email && (!EMAIL_RE.test(String(b.email)) || String(b.email).length > 150)) return 'Email is invalid.';
  if (b.isActive !== undefined && typeof b.isActive !== 'boolean') return 'isActive must be true or false.';
  return null;
}

router.get('/', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;
  const result = await pool.query(
    `SELECT * FROM suppliers WHERE hospital_id = $1 AND name ILIKE $2 ORDER BY name ASC`,
    [hospitalId, `%${search}%`]
  );
  res.json({ suppliers: result.rows });
});

router.post('/', requirePermission('inventory.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, contactPerson, phone, email, address, gstin } = req.body;
  const sErr = supplierError(req.body);
  if (sErr) return res.status(400).json({ message: sErr });

  const result = await pool.query(
    `INSERT INTO suppliers (hospital_id, name, contact_person, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [hospitalId, name.trim(), contactPerson, phone, email, address, gstin]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, contactPerson, phone, email, address, gstin, isActive } = req.body;
  const sErr = supplierError(req.body);
  if (sErr) return res.status(400).json({ message: sErr });

  const result = await pool.query(
    `UPDATE suppliers SET name=$1, contact_person=$2, phone=$3, email=$4, address=$5, gstin=$6, is_active=COALESCE($7, is_active)
     WHERE id=$8 AND hospital_id=$9 RETURNING *`,
    [name.trim(), contactPerson, phone, email, address, gstin, isActive ?? null, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Supplier not found.' });
  res.json(result.rows[0]);
});

module.exports = router;
