const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isPositiveInt, isMoney, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

async function generatePoNumber(client) {
  const seqRes = await client.query(`SELECT nextval('po_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `PO-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

function withTotal(po) {
  const total = (po.lines || []).reduce((sum, l) => sum + l.quantity * l.unit_cost * (1 + Number(l.gst_percent) / 100), 0);
  return { ...po, totalAmount: Math.round(total * 100) / 100 };
}

// GET /api/purchase-orders?status=
router.get('/', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '' } = req.query;

  const conditions = ['po.hospital_id = $1'];
  const params = [hospitalId];
  if (status) { params.push(status); conditions.push(`po.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE ${conditions.join(' AND ')} ORDER BY po.order_date DESC`,
    params
  );

  const withLines = await Promise.all(result.rows.map(async (po) => {
    const linesRes = await pool.query(`SELECT pol.*, i.name AS item_name FROM purchase_order_lines pol JOIN inventory_items i ON i.id = pol.item_id WHERE pol.po_id = $1`, [po.id]);
    return withTotal({ ...po, lines: linesRes.rows });
  }));

  const statusCounts = await pool.query(
    `SELECT status, COUNT(*) FROM purchase_orders WHERE hospital_id = $1 GROUP BY status`,
    [hospitalId]
  );

  res.json({ purchaseOrders: withLines, statusCounts: statusCounts.rows });
});

// GET /api/purchase-orders/:id
router.get('/:id', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const poRes = await pool.query(
    `SELECT po.*, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = $1 AND po.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!poRes.rows[0]) return res.status(404).json({ message: 'Purchase order not found.' });

  const linesRes = await pool.query(`SELECT pol.*, i.name AS item_name, i.item_code FROM purchase_order_lines pol JOIN inventory_items i ON i.id = pol.item_id WHERE pol.po_id = $1`, [id]);
  res.json(withTotal({ ...poRes.rows[0], lines: linesRes.rows }));
});

// POST /api/purchase-orders { supplierId, expectedDate, lines: [{itemId, quantity, unitCost, gstPercent}] }
router.post('/', requirePermission('inventory.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { supplierId, expectedDate, lines = [] } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: 'Add at least one line item.' });
  if (lines.length > 200) return res.status(400).json({ message: 'A purchase order can have at most 200 lines.' });
  if (expectedDate && !isDateString(expectedDate)) return res.status(400).json({ message: 'Expected date is not a valid date.' });

  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    if (!isPositiveInt(line.quantity)) return res.status(400).json({ message: `Line ${n}: quantity must be a whole number greater than 0.` });
    if (!isMoney(line.unitCost)) return res.status(400).json({ message: `Line ${n}: unit cost must be 0 or more.` });
    if (line.gstPercent !== undefined && !(Number(line.gstPercent) >= 0 && Number(line.gstPercent) <= 100)) {
      return res.status(400).json({ message: `Line ${n}: GST must be between 0 and 100.` });
    }
  }
  // Item and supplier ids are global serials: they must belong to this hospital, otherwise receiving
  // the order would change another hospital's stock.
  if (!(await idsBelongToHospital(pool, 'inventory_items', hospitalId, lines.map((l) => l.itemId)))
      || lines.some((l) => !isPositiveInt(l.itemId))) {
    return res.status(400).json({ message: 'One or more inventory items were not found.' });
  }
  if (!(await idsBelongToHospital(pool, 'suppliers', hospitalId, [supplierId]))) {
    return res.status(400).json({ message: 'Supplier not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poNumber = await generatePoNumber(client);
    const poRes = await client.query(
      `INSERT INTO purchase_orders (hospital_id, po_number, supplier_id, expected_date, status) VALUES ($1,$2,$3,$4,'Draft') RETURNING *`,
      [hospitalId, poNumber, supplierId || null, expectedDate || null]
    );
    const po = poRes.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_order_lines (po_id, item_id, quantity, unit_cost, gst_percent) VALUES ($1,$2,$3,$4,$5)`,
        [po.id, line.itemId, line.quantity, line.unitCost, line.gstPercent || 0]
      );
    }
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Purchase Order', module: 'Inventory', details: poNumber, ip: req.ip });
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/purchase-orders/:id/mark-ordered
router.patch('/:id/mark-ordered', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE purchase_orders SET status = 'Ordered' WHERE id = $1 AND hospital_id = $2 AND status = 'Draft' RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(400).json({ message: 'Only Draft purchase orders can be marked as Ordered.' });
  res.json(result.rows[0]);
});

// PATCH /api/purchase-orders/:id/cancel
router.patch('/:id/cancel', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE purchase_orders SET status = 'Cancelled' WHERE id = $1 AND hospital_id = $2 AND status IN ('Draft','Ordered') RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(400).json({ message: 'Only Draft or Ordered purchase orders can be cancelled.' });
  res.json(result.rows[0]);
});

// POST /api/purchase-orders/:id/receive - increases stock and writes stock_ledger entries
router.post('/:id/receive', requirePermission('inventory.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE: two simultaneous "receive" calls must not both add the stock.
    const poRes = await client.query(`SELECT * FROM purchase_orders WHERE id = $1 AND hospital_id = $2 AND status = 'Ordered' FOR UPDATE`, [id, hospitalId]);
    const po = poRes.rows[0];
    if (!po) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only an Ordered purchase order can be received.' });
    }

    const linesRes = await client.query(`SELECT * FROM purchase_order_lines WHERE po_id = $1`, [id]);
    for (const line of linesRes.rows) {
      const itemRes = await client.query(`SELECT * FROM inventory_items WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [line.item_id, hospitalId]);
      const newBalance = itemRes.rows[0].current_stock + line.quantity;
      await client.query(`UPDATE inventory_items SET current_stock = $1 WHERE id = $2`, [newBalance, line.item_id]);
      await client.query(
        `INSERT INTO stock_ledger (item_id, transaction_type, quantity_change, balance_after, reference, performed_by)
         VALUES ($1, 'Purchase Receipt', $2, $3, $4, $5)`,
        [line.item_id, line.quantity, newBalance, po.po_number, name]
      );
    }

    const updated = await client.query(
      `UPDATE purchase_orders SET status = 'Received', received_on = NOW(), received_by = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Receive Purchase Order', module: 'Inventory', details: `Received ${po.po_number} — stock updated for ${linesRes.rows.length} item(s)`, ip: req.ip });
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
