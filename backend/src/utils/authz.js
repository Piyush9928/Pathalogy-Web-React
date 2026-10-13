// Authorisation helpers for user / role management. The rule that prevents privilege escalation:
// nobody can hand out, or act on, more power than they hold themselves. Super Admin is the only
// exception because it already holds every permission.

const isSuperAdmin = (actor) => actor.roleCode === 'SUPERADMIN';

/** True when every permission in `needed` is also in `held` (case-insensitive). */
function covers(held, needed) {
  const have = new Set((held || []).map((p) => p.toLowerCase()));
  return (needed || []).every((p) => have.has(p.toLowerCase()));
}

/** May `actor` assign this role to a user, or grant its permissions? */
function canGrantRole(actor, role) {
  if (!role) return false;
  if (isSuperAdmin(actor)) return true;
  if (role.code === 'SUPERADMIN') return false;
  return covers(actor.permissions, role.permissions);
}

/** May `actor` change / reset / deactivate / delete a user who currently holds `targetRole`? */
function canManageUserWithRole(actor, targetRole) {
  return canGrantRole(actor, targetRole);
}

module.exports = { isSuperAdmin, covers, canGrantRole, canManageUserWithRole };
