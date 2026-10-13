const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission, clearAuthCache } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { MODULES, viewOnlyCodes, allCodes } = require('../config/permissions');
const { isSuperAdmin, covers } = require('../utils/authz');

const router = express.Router();
router.use(requireAuth);

// GET /api/roles - list with user counts
router.get('/', requirePermission('roles.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT r.*, COUNT(u.id) AS user_count
     FROM roles r LEFT JOIN users u ON u.role_id = r.id
     WHERE r.hospital_id = $1
     GROUP BY r.id ORDER BY r.name ASC`,
    [hospitalId]
  );
  res.json({ roles: result.rows });
});

// GET /api/roles/permission-catalog - the static module/action catalog for building a matrix UI
router.get('/permission-catalog', requirePermission('roles.view'), (req, res) => {
  res.json({ modules: MODULES });
});

// POST /api/roles
router.post('/', requirePermission('roles.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, code, description } = req.body;
  if (!String(name || '').trim() || !String(code || '').trim()) return res.status(400).json({ message: 'Name and code are required.' });
  if (String(name).length > 100) return res.status(400).json({ message: 'Name must be 100 characters or fewer.' });
  if (!/^[A-Za-z0-9_]{2,50}$/.test(String(code).trim())) return res.status(400).json({ message: 'Code must be 2-50 letters, digits or underscores.' });
  if (String(code).trim().toUpperCase() === 'SUPERADMIN') return res.status(400).json({ message: 'This code is reserved.' });

  try {
    const result = await pool.query(
      `INSERT INTO roles (hospital_id, name, code, description, is_system, is_active, permissions)
       VALUES ($1,$2,$3,$4,FALSE,TRUE,$5) RETURNING *`,
      [hospitalId, String(name).trim(), String(code).trim().toUpperCase(), description, viewOnlyCodes()]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Role', module: 'Roles', details: `Created role ${name}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Role code already exists.' });
    throw err;
  }
});

// PUT /api/roles/:id
router.put('/:id', requirePermission('roles.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, description } = req.body;
  if (!String(name || '').trim() || String(name).length > 100) return res.status(400).json({ message: 'A name of up to 100 characters is required.' });

  const roleRes = await pool.query(`SELECT * FROM roles WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!roleRes.rows[0]) return res.status(404).json({ message: 'Role not found.' });

  const result = await pool.query(
    `UPDATE roles SET name = $1, description = $2 WHERE id = $3 AND hospital_id = $4 RETURNING *`,
    [name, description, id, hospitalId]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit Role', module: 'Roles', details: `Edited role ${name}`, ip: req.ip });
  res.json(result.rows[0]);
});

// PUT /api/roles/:id/permissions { permissions: string[] }
router.put('/:id/permissions', requirePermission('roles.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { permissions } = req.body;

  const roleRes = await pool.query(`SELECT * FROM roles WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  const role = roleRes.rows[0];
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (role.is_system) return res.status(400).json({ message: 'Cannot modify permissions for a system role.' });

  if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== 'string')) {
    return res.status(400).json({ message: 'permissions must be a list of permission codes.' });
  }
  const catalog = new Set(allCodes().map((c) => c.toLowerCase()));
  const unknown = permissions.filter((p) => !catalog.has(p.toLowerCase()));
  if (unknown.length) return res.status(400).json({ message: `Unknown permission code(s): ${unknown.slice(0, 5).join(', ')}` });
  // Nobody can grant a permission they do not hold themselves (otherwise "roles.edit" = every permission).
  if (!isSuperAdmin(req.user)) {
    const notHeld = permissions.filter((p) => !covers(req.user.permissions, [p]));
    if (notHeld.length) return res.status(403).json({ message: `You cannot grant permissions you do not have: ${notHeld.slice(0, 5).join(', ')}` });
  }
  const deduped = [...new Set(permissions.map((p) => p.toLowerCase()))];

  const result = await pool.query(
    `UPDATE roles SET permissions = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`,
    [deduped, id, hospitalId]
  );
  clearAuthCache();
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Update Permissions', module: 'Roles', details: `Updated permissions for ${role.name}`, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

// DELETE /api/roles/:id
router.delete('/:id', requirePermission('roles.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const roleRes = await pool.query(`SELECT * FROM roles WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  const role = roleRes.rows[0];
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (role.is_system) return res.status(400).json({ message: 'Cannot delete a system role.' });

  const usageRes = await pool.query(`SELECT COUNT(*) FROM users WHERE role_id = $1`, [id]);
  if (Number(usageRes.rows[0].count) > 0) {
    return res.status(400).json({ message: 'Cannot delete a role that is still assigned to users.' });
  }

  await pool.query(`DELETE FROM roles WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete Role', module: 'Roles', details: `Deleted role ${role.name}`, severity: 'Critical', ip: req.ip });
  res.json({ message: 'Role deleted.' });
});

module.exports = router;
