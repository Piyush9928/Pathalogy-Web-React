const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const PASSWORD_CHANGE_ALLOWED = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];

// The JWT only proves who signed in. What the user may do *now* (active, role, permissions, hospital
// status, temporary-password flag) is read from the database, so deactivating a user, editing a role
// or suspending a hospital takes effect immediately instead of when the token expires.
// A short cache keeps this to roughly one query per user per few seconds; routes that change any of
// that data call clearAuthCache() so the change is visible at once on this server.
const PRINCIPAL_CACHE_TTL_MS = 5000;
const principalCache = new Map();

function clearAuthCache() {
  principalCache.clear();
}

async function loadPrincipal(userId) {
  const hit = principalCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const result = await pool.query(
    `SELECT u.id, u.hospital_id, u.full_name, u.email, u.branch_id, u.is_active, u.must_change_password,
            r.name AS role_name, r.code AS role_code, r.permissions, r.is_active AS role_active,
            h.status AS hospital_status, h.subscription_expiry
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN hospitals h ON h.id = u.hospital_id
     WHERE u.id = $1`,
    [userId]
  );
  const value = result.rows[0] || null;
  principalCache.set(userId, { value, expires: Date.now() + PRINCIPAL_CACHE_TTL_MS });
  return value;
}

/**
 * Verifies the Bearer JWT, then refreshes the caller's identity and permissions from the database
 * and attaches them to req.user. Shape: { userId, hospitalId, hospitalCode, hospitalName, role,
 * roleCode, permissions, name, email, branchId, mustChangePassword }.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  // Developer / doctor-portal / patient-portal tokens share the signing secret but carry a
  // `kind` claim. They must never pass as hospital staff. Staff tokens have no `kind`.
  if (payload.kind && payload.kind !== 'staff') {
    return res.status(403).json({ message: 'This token cannot be used for staff access.' });
  }

  try {
    const principal = await loadPrincipal(payload.userId);
    // 401 (not 403) for "this account can no longer be used" so the client drops the session.
    if (!principal || !principal.is_active) {
      return res.status(401).json({ message: 'Your account is deactivated or no longer exists.' });
    }
    if (principal.hospital_status === 'Suspended') {
      return res.status(401).json({ message: 'This hospital account is suspended.' });
    }
    if (principal.subscription_expiry && new Date(principal.subscription_expiry) < new Date(new Date().toDateString())) {
      return res.status(401).json({ message: 'Your subscription has expired. Please contact the platform administrator.' });
    }

    req.user = {
      ...payload,
      userId: principal.id,
      hospitalId: principal.hospital_id,
      name: principal.full_name,
      email: principal.email,
      branchId: principal.branch_id,
      role: principal.role_name,
      roleCode: principal.role_code,
      permissions: principal.role_active ? principal.permissions || [] : [],
      mustChangePassword: principal.must_change_password,
    };

    // A user holding a temporary password may only change it (or inspect/sign out) until they do.
    if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your temporary password before continuing.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Fine-grained permission check, e.g. requirePermission('patients.create').
 * Mirrors Attributes/RequirePermissionAttribute.cs -> role.Has(code).
 */
function requirePermission(permissionCode) {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    const hasPermission = permissions.some(
      (p) => p.toLowerCase() === permissionCode.toLowerCase()
    );
    if (!hasPermission) {
      return res.status(403).json({
        message: 'Access denied.',
        requiredPermission: permissionCode,
      });
    }
    return next();
  };
}

/**
 * Coarse role-based check, e.g. requireRole('Super Admin', 'Admin').
 * Mirrors AdminController's hardcoded AllowedRoles gate.
 */
function requireRole(...allowedRoles) {
  const normalized = allowedRoles.map((r) => r.toLowerCase());
  return (req, res, next) => {
    const role = (req.user?.role || '').toLowerCase();
    if (!normalized.includes(role)) {
      return res.status(403).json({ message: 'Access denied for this role.' });
    }
    return next();
  };
}

module.exports = { requireAuth, requirePermission, requireRole, clearAuthCache };
