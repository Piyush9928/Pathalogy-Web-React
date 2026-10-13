const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isInt, isNonNegInt, isMoney, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['Reagent', 'Consumable', 'Quality Control', 'Stationery', 'Equipment'];
const UNITS = ['Nos', 'Pack', 'Kit', 'Box (100)', 'Bottle', 'Vial', 'Roll', 'Litre'];

function withComputed(item) {
  const now = new Date();
  const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
  return {
    ...item,
    is_low_stock: item.current_stock <= item.minimum_stock,
    is_expired: !!expiry && expiry < now,
    is_expiring_soon: !!expiry && expiry >= now && expiry <= new Date(now.getTime() + 60 * 86400000),
    stock_value: Number(item.current_stock) * Number(item.unit_cost),
  };
}

// Validates an item body (create and full update). Returns a message, or null when valid.
// `creating` additionally allows the opening stock figure.
async function validateItemBody(b, hospitalId, { creating }) {
  const code = String(b.itemCode || '').trim();
  const itemName = String(b.name || '').trim();
  if (!code || !itemName) return 'Item code and name are required.';
  if (code.length > 30) return 'Item code must be 30 characters or fewer.';
  if (itemName.length > 200) return 'Name must be 200 characters or fewer.';
  if (b.category !== undefined && !CATEGORIES.includes(b.category)) return 'Invalid category.';
  if (b.unit !== undefined && (!String(b.unit).trim() || String(b.unit).length > 30)) return 'Invalid unit.';
  if (creating && b.currentStock !== undefined && !isNonNegInt(b.currentStock)) return 'Opening stock must be a whole number, 0 or more.';
  if (b.minimumStock !== undefined && !isNonNegInt(b.minimumStock)) return 'Minimum stock must be a whole number, 0 or more.';
  if (b.unitCost !== undefined && !isMoney(b.unitCost)) return 'Unit cost must be 0 or more.';
  if (b.expiryDate && !isDateString(b.expiryDate)) return 'Expiry date is not a valid date.';

  const checks = [
    ['suppliers', b.supplierId], ['stock_group_masters', b.groupId], ['stock_sub_group_masters', b.subGroupId],
    ['commodity_masters', b.commodityId], ['unit_masters', b.unitMasterId],
  ];
  for (const [table, id] of checks) {
    if (!(await idsBelongToHospital(pool, table, hospitalId, [id]))) return 'A selected supplier or master record was not found.';
  }
  return null;
}

// GET /api/inventory?search=
router.get('/', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT i.*, s.name AS supplier_name FROM inventory_items i
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE i.hospital_id = $1 AND (i.name ILIKE $2 OR i.item_code ILIKE $2 OR i.category ILIKE $2)
     ORDER BY i.name ASC`,
    [hospitalId, `%${search}%`]
  );

  const items = result.rows.map(withComputed);
  const stats = {
    totalItems: items.length,
    lowStock: items.filter((i) => i.is_low_stock).length,
    expiringSoon: items.filter((i) => i.is_expiring_soon).length,
    expired: items.filter((i) => i.is_expired).length,
    totalStockValue: items.reduce((sum, i) => sum + i.stock_value, 0),
  };

  res.json({ items, stats, categories: CATEGORIES, units: UNITS });
});

// GET /api/inventory/expiry-alert?daysAhead=
router.get('/expiry-alert', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const daysAhead = Number(req.query.daysAhead) || 90;

  const result = await pool.query(`SELECT * FROM inventory_items WHERE hospital_id = $1 AND expiry_date IS NOT NULL`, [hospitalId]);
  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 86400000);

  const expired = [], expiringSoon = [], goodStock = [];
  for (const item of result.rows.map(withComputed)) {
    const expiry = new Date(item.expiry_date);
    if (expiry < now) expired.push(item);
    else if (expiry <= horizon) expiringSoon.push(item);
    else goodStock.push(item);
  }

  res.json({ expired, expiringSoon, goodStock, daysAhead });
});

// GET /api/inventory/:id
router.get('/:id', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE i.id = $1 AND i.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Item not found.' });
  res.json(withComputed(result.rows[0]));
});

// POST /api/inventory
router.post('/', requirePermission('inventory.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  const invalid = await validateItemBody(b, hospitalId, { creating: true });
  if (invalid) return res.status(400).json({ message: invalid });

  try {
    const result = await pool.query(
      `INSERT INTO inventory_items (hospital_id, item_code, name, category, unit, current_stock, minimum_stock, unit_cost, supplier_id, expiry_date, group_id, sub_group_id, commodity_id, unit_master_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        hospitalId, b.itemCode.trim(), b.name.trim(), b.category || 'Reagent', b.unit || 'Nos', b.currentStock || 0, b.minimumStock || 0,
        b.unitCost || 0, b.supplierId || null, b.expiryDate || null, b.groupId || null, b.subGroupId || null, b.commodityId || null, b.unitMasterId || null,
      ]
    );
    const item = result.rows[0];

    if (item.current_stock > 0) {
      await pool.query(
        `INSERT INTO stock_ledger (item_id, transaction_type, quantity_change, balance_after, reference, performed_by)
         VALUES ($1, 'Manual Adjustment', $2, $2, 'Opening stock', $3)`,
        [item.id, item.current_stock, name]
      );
    }

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Inventory Item', module: 'Inventory', details: `${b.itemCode} - ${b.name}`, ip: req.ip });
    res.status(201).json(withComputed(item));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Item code already exists.' });
    throw err;
  }
});

// PUT /api/inventory/:id (does not change current_stock directly - use /adjust-stock for that)
router.put('/:id', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;

  const invalid = await validateItemBody(b, hospitalId, { creating: false });
  if (invalid) return res.status(400).json({ message: invalid });

  try {
    const result = await pool.query(
      `UPDATE inventory_items SET
         item_code=$1, name=$2, category=COALESCE($3, category), unit=COALESCE($4, unit), minimum_stock=$5, unit_cost=$6, supplier_id=$7,
         expiry_date=$8, group_id=$9, sub_group_id=$10, commodity_id=$11, unit_master_id=$12
       WHERE id=$13 AND hospital_id=$14 RETURNING *`,
      [
        b.itemCode.trim(), b.name.trim(), b.category || null, b.unit || null, b.minimumStock || 0, b.unitCost || 0, b.supplierId || null,
        b.expiryDate || null, b.groupId || null, b.subGroupId || null, b.commodityId || null, b.unitMasterId || null, id, hospitalId,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Item not found.' });

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Inventory Item', module: 'Inventory', details: `${b.itemCode} - ${b.name}`, ip: req.ip });
    res.json(withComputed(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Item code already exists.' });
    throw err;
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', requirePermission('inventory.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  let result;
  try {
    result = await pool.query(`DELETE FROM inventory_items WHERE id = $1 AND hospital_id = $2 RETURNING item_code, name`, [id, hospitalId]);
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: 'This item is used by purchase orders and cannot be deleted.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Item not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Inventory Item', module: 'Inventory', details: `${result.rows[0].item_code} - ${result.rows[0].name}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Item deleted.' });
});

// POST /api/inventory/:id/adjust-stock { quantityChange, reason }
router.post('/:id/adjust-stock', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { quantityChange, reason } = req.body;

  if (!isInt(quantityChange) || Number(quantityChange) === 0 || Math.abs(Number(quantityChange)) > 1000000) {
    return res.status(400).json({ message: 'Enter a non-zero whole-number quantity change.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the row so concurrent adjustments cannot overwrite each other's balance.
    const itemRes = await client.query(`SELECT * FROM inventory_items WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const item = itemRes.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Item not found.' });
    }

    const newBalance = item.current_stock + Number(quantityChange);
    if (newBalance < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Adjustment would result in negative stock.' });
    }

    await client.query(`UPDATE inventory_items SET current_stock = $1 WHERE id = $2`, [newBalance, id]);
    await client.query(
      `INSERT INTO stock_ledger (item_id, transaction_type, quantity_change, balance_after, reference, performed_by)
       VALUES ($1, 'Manual Adjustment', $2, $3, $4, $5)`,
      [id, quantityChange, newBalance, reason || null, name]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Adjust Stock', module: 'Inventory', details: `${item.name}: ${quantityChange > 0 ? '+' : ''}${quantityChange} (${reason || 'no reason given'})`, ip: req.ip });
    const updated = await pool.query(`SELECT * FROM inventory_items WHERE id = $1`, [id]);
    res.json(withComputed(updated.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/inventory/:id/stock-ledger (or /api/inventory/stock-ledger for all items)
router.get('/:id/stock-ledger', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  // Scoped through the item so one hospital can never read another's ledger.
  const result = await pool.query(
    `SELECT sl.* FROM stock_ledger sl JOIN inventory_items i ON i.id = sl.item_id
     WHERE sl.item_id = $1 AND i.hospital_id = $2 ORDER BY sl.happened_at DESC`,
    [id, hospitalId]
  );
  res.json({ entries: result.rows });
});

module.exports = router;
