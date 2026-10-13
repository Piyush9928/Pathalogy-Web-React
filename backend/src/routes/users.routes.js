const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requirePermission, clearAuthCache } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isPositiveInt, idsBelongToHospital } = require('../utils/validate');
const { canGrantRole, canManageUserWithRole } = require('../utils/authz');

const router = express.Router();
router.use(requireAuth);

const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function isLastSuperAdmin(hospitalId, userId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.hospital_id = $1 AND r.code = 'SUPERADMIN' AND u.is_active = TRUE AND u.id != $2`,
    [hospitalId, userId]
  );
  return Number(result.rows[0].count) === 0;
}

async function loadRole(hospitalId, roleId) {
  if (!isPositiveInt(roleId)) return null;
  const res = await pool.query(`SELECT * FROM roles WHERE id = $1 AND hospital_id = $2 AND is_active = TRUE`, [roleId, hospitalId]);
  return res.rows[0] || null;
}

// The target user together with the role they hold now (needed for the "can you manage them" check).
async function loadTarget(hospitalId, id) {
  if (!isPositiveInt(id)) return null;
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.is_active, r.id AS role_id, r.code AS role_code, r.permissions AS role_permissions
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.hospital_id = $2`,
    [id, hospitalId]
  );
  return res.rows[0] || null;
}

const targetRole = (t) => ({ code: t.role_code, permissions: t.role_permissions });

// GET /api/users?search=&roleId=&status=
router.get('/', requirePermission('users.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', roleId, status } = req.query;
  if (roleId !== undefined && roleId !== '' && !isPositiveInt(roleId)) return res.status(400).json({ message: 'Invalid role filter.' });

  const conditions = ['u.hospital_id = $1', '(u.full_name ILIKE $2 OR u.email ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];

  if (roleId) {
    params.push(roleId);
    conditions.push(`u.role_id = $${params.length}`);
  }
  if (status === 'active') conditions.push('u.is_active = TRUE');
  if (status === 'inactive') conditions.push('u.is_active = FALSE');

  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.designation, u.is_active, u.must_change_password,
            u.last_login, u.created_on, u.branch_id, r.id AS role_id, r.name AS role_name, b.name AS branch_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name ASC`,
    params
  );

  res.json({ users: result.rows });
});

// POST /api/users
router.post('/', requirePermission('users.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { fullName, email, phone, roleId, branchId, designation, tempPassword } = req.body;

  if (!String(fullName || '').trim() || !email || !roleId || !tempPassword || tempPassword.length < 8) {
    return res.status(400).json({ message: 'Full name, email, role, and a temp password (min 8 chars) are required.' });
  }
  if (!EMAIL_RE.test(String(email).trim())) return res.status(400).json({ message: 'Enter a valid email.' });
  if (String(fullName).length > 150) return res.status(400).json({ message: 'Full name must be 150 characters or fewer.' });

  const role = await loadRole(hospitalId, roleId);
  if (!role) return res.status(400).json({ message: 'Select a valid role.' });
  // You can only create users up to your own level: an Admin cannot mint a Super Admin.
  if (!canGrantRole(req.user, role)) return res.status(403).json({ message: 'You cannot assign a role with more access than your own.' });
  if (branchId && !(await idsBelongToHospital(pool, 'branches', hospitalId, [branchId]))) {
    return res.status(400).json({ message: 'Select a valid branch.' });
  }

  try {
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const result = await pool.query(
      `INSERT INTO users (hospital_id, full_name, email, phone, role_id, branch_id, password_hash, designation, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id, full_name, email, is_active`,
      [hospitalId, String(fullName).trim(), String(email).trim().toLowerCase(), phone, role.id, branchId || null, passwordHash, designation]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create User', module: 'Users', details: `Created user ${fullName} (${role.name})`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A user with this email already exists.' });
    throw err;
  }
});

// PUT /api/users/:id
router.put('/:id', requirePermission('users.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { fullName, phone, roleId, branchId, designation } = req.body;

  if (!String(fullName || '').trim()) return res.status(400).json({ message: 'Full name is required.' });
  const target = await loadTarget(hospitalId, id);
  if (!target) return res.status(404).json({ message: 'User not found.' });

  // You may only edit someone at or below your own level, and only move them to a role you could assign.
  if (!canManageUserWithRole(req.user, targetRole(target))) return res.status(403).json({ message: 'You cannot modify a user with more access than your own.' });
  const newRole = await loadRole(hospitalId, roleId);
  if (!newRole) return res.status(400).json({ message: 'Select a valid role.' });
  if (newRole.id !== target.role_id && !canGrantRole(req.user, newRole)) {
    return res.status(403).json({ message: 'You cannot assign a role with more access than your own.' });
  }
  if (branchId && !(await idsBelongToHospital(pool, 'branches', hospitalId, [branchId]))) {
    return res.status(400).json({ message: 'Select a valid branch.' });
  }
  // Demoting the only Super Admin would lock everyone out of administration.
  if (target.role_code === 'SUPERADMIN' && newRole.code !== 'SUPERADMIN' && (await isLastSuperAdmin(hospitalId, target.id))) {
    return res.status(400).json({ message: 'Cannot change the role of the last active Super Admin.' });
  }

  const result = await pool.query(
    `UPDATE users SET full_name=$1, phone=$2, role_id=$3, branch_id=$4, designation=$5
     WHERE id = $6 AND hospital_id = $7 RETURNING id, full_name, email`,
    [String(fullName).trim(), phone, newRole.id, branchId || null, designation, id, hospitalId]
  );
  clearAuthCache();
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit User', module: 'Users', details: `Edited user ${fullName}${newRole.id !== target.role_id ? ` (role -> ${newRole.name})` : ''}`, severity: newRole.id !== target.role_id ? 'Warning' : 'Info', ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/users/:id/active { isActive }
router.patch('/:id/active', requirePermission('users.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });

  const target = await loadTarget(hospitalId, id);
  if (!target) return res.status(404).json({ message: 'User not found.' });
  if (!canManageUserWithRole(req.user, targetRole(target))) return res.status(403).json({ message: 'You cannot modify a user with more access than your own.' });
  if (!isActive && target.id === req.user.userId) return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  if (!isActive && target.role_code === 'SUPERADMIN' && (await isLastSuperAdmin(hospitalId, target.id))) {
    return res.status(400).json({ message: 'Cannot deactivate the last active Super Admin.' });
  }

  const result = await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2 AND hospital_id = $3 RETURNING id, full_name, is_active`, [isActive, id, hospitalId]);
  clearAuthCache();

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: isActive ? 'Activate User' : 'Deactivate User', module: 'Users', details: result.rows[0].full_name, ip: req.ip });
  res.json(result.rows[0]);
});

// POST /api/users/:id/reset-password { tempPassword }
router.post('/:id/reset-password', requirePermission('users.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { tempPassword } = req.body;
  if (!tempPassword || tempPassword.length < 8) {
    return res.status(400).json({ message: 'Temp password must be at least 8 characters.' });
  }

  const target = await loadTarget(hospitalId, id);
  if (!target) return res.status(404).json({ message: 'User not found.' });
  // Resetting someone's password is taking over their account, so the same "no more access than you" rule applies.
  if (!canManageUserWithRole(req.user, targetRole(target))) return res.status(403).json({ message: 'You cannot reset the password of a user with more access than your own.' });

  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, failed_login_attempts = 0, locked_until = NULL
     WHERE id = $2 AND hospital_id = $3 RETURNING id, full_name`,
    [passwordHash, id, hospitalId]
  );
  clearAuthCache();

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Reset Password', module: 'Users', details: result.rows[0].full_name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Password reset. User must change password on next login.' });
});

// DELETE /api/users/:id
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const target = await loadTarget(hospitalId, id);
  if (!target) return res.status(404).json({ message: 'User not found.' });
  if (target.id === req.user.userId) return res.status(400).json({ message: 'You cannot delete your own account.' });
  if (!canManageUserWithRole(req.user, targetRole(target))) return res.status(403).json({ message: 'You cannot delete a user with more access than your own.' });
  if (target.role_code === 'SUPERADMIN' && (await isLastSuperAdmin(hospitalId, target.id))) {
    return res.status(400).json({ message: 'Cannot delete the last active Super Admin.' });
  }

  let result;
  try {
    result = await pool.query(`DELETE FROM users WHERE id = $1 AND hospital_id = $2 RETURNING full_name`, [id, hospitalId]);
  } catch (err) {
    // Users who have signed in, approved things or been linked to an employee are referenced elsewhere.
    if (err.code === '23503') return res.status(409).json({ message: 'This user has recorded activity and cannot be deleted. Deactivate the account instead.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'User not found.' });
  clearAuthCache();

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete User', module: 'Users', details: result.rows[0].full_name, severity: 'Critical', ip: req.ip });
  res.json({ message: 'User deleted.' });
});

module.exports = router;
