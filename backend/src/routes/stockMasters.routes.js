const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { paramGuard, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// GET /api/stock-masters - all four classification lists together
router.get('/', requirePermission('inventory.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const [groups, subGroups, commodities, units] = await Promise.all([
    pool.query(`SELECT * FROM stock_group_masters WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]),
    pool.query(`SELECT sg.*, g.name AS group_name FROM stock_sub_group_masters sg LEFT JOIN stock_group_masters g ON g.id = sg.group_id WHERE sg.hospital_id = $1 ORDER BY sg.name ASC`, [hospitalId]),
    pool.query(`SELECT c.*, g.name AS group_name, sg.name AS sub_group_name FROM commodity_masters c LEFT JOIN stock_group_masters g ON g.id = c.group_id LEFT JOIN stock_sub_group_masters sg ON sg.id = c.sub_group_id WHERE c.hospital_id = $1 ORDER BY c.name ASC`, [hospitalId]),
    pool.query(`SELECT * FROM unit_masters WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]),
  ]);
  res.json({ groups: groups.rows, subGroups: subGroups.rows, commodities: commodities.rows, units: units.rows });
});

// Max name length per table (matches the VARCHAR sizes).
const NAME_MAX = { stock_group_masters: 100, stock_sub_group_masters: 100, commodity_masters: 100, unit_masters: 50 };

function crudRoutes(table, fields) {
  const sub = express.Router();
  paramGuard(sub, 'id');

  sub.post('/', requirePermission('inventory.create'), async (req, res) => {
    const { hospitalId } = req.user;
    const name = req.body.name;
    if (typeof name !== 'string' || !name.trim() || name.length > NAME_MAX[table]) return res.status(400).json({ message: `Name is required (max ${NAME_MAX[table]} characters).` });
    // group / sub-group ids are global serials: they must belong to this hospital.
    const ok = (await idsBelongToHospital(pool, 'stock_group_masters', hospitalId, [req.body.groupId]))
      && (await idsBelongToHospital(pool, 'stock_sub_group_masters', hospitalId, [req.body.subGroupId]));
    if (!ok) return res.status(404).json({ message: 'Group or sub-group not found.' });
    const values = fields.map((f) => (f.name === 'name' ? name.trim() : (req.body[f.name] === '' ? null : req.body[f.name] ?? null)));

    const columns = ['hospital_id', ...fields.map((f) => f.column)];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) RETURNING *`,
      [hospitalId, ...values]
    );
    res.status(201).json(result.rows[0]);
  });

  sub.delete('/:id', requirePermission('inventory.delete'), async (req, res) => {
    const { hospitalId } = req.user;
    const { id } = req.params;
    let result;
    try {
      result = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND hospital_id = $2 RETURNING id`, [id, hospitalId]);
    } catch (e) {
      if (e.code === '23503') return res.status(409).json({ message: 'This entry is in use (by items or other masters) and cannot be deleted.' });
      throw e;
    }
    if (!result.rows[0]) return res.status(404).json({ message: 'Not found.' });
    res.json({ message: 'Deleted.' });
  });

  return sub;
}

router.use('/groups', crudRoutes('stock_group_masters', [{ name: 'name', column: 'name' }]));
router.use('/sub-groups', crudRoutes('stock_sub_group_masters', [{ name: 'name', column: 'name' }, { name: 'groupId', column: 'group_id' }]));
router.use('/commodities', crudRoutes('commodity_masters', [{ name: 'name', column: 'name' }, { name: 'groupId', column: 'group_id' }, { name: 'subGroupId', column: 'sub_group_id' }]));
router.use('/units', crudRoutes('unit_masters', [{ name: 'name', column: 'name' }]));

module.exports = router;
