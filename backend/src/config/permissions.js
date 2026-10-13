// Static permission catalog - mirrors Entities/Permission.cs (PermissionCatalog) from the
// original ASP.NET Core app. Permission codes follow "{module}.{action}".
// Permissions are NOT stored as DB rows; roles store a flat array of these codes
// (see roles.permissions text[] column).

const MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', actions: ['view'] },
  { key: 'patients', label: 'Patients', icon: 'bi-people-fill', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'doctors', label: 'Doctors', icon: 'bi-person-badge', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'bookings', label: 'Bookings', icon: 'bi-calendar-check', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'reports', label: 'Reports', icon: 'bi-file-earmark-medical', actions: ['view', 'create', 'edit', 'approve', 'print', 'export'] },
  { key: 'tests', label: 'Tests & Lab Masters', icon: 'bi-clipboard2-pulse', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'billing', label: 'Billing', icon: 'bi-receipt', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'inventory', label: 'Inventory', icon: 'bi-box-seam', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'users', label: 'Users', icon: 'bi-person-gear', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'roles', label: 'Roles', icon: 'bi-shield-lock', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'bloodbank', label: 'Blood Bank', icon: 'bi-droplet-half', actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export'] },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'bi-capsule', actions: ['view', 'create', 'edit', 'delete', 'sell', 'export'] },
  { key: 'opd', label: 'OPD', icon: 'bi-ticket-perforated', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'ipd', label: 'IPD', icon: 'bi-hospital', actions: ['view', 'create', 'edit', 'delete', 'admit', 'discharge'] },
  { key: 'surgery', label: 'Surgery / OT', icon: 'bi-heart-pulse', actions: ['view', 'create', 'edit', 'delete', 'approve'] },
  { key: 'radiology', label: 'Radiology / Echo', icon: 'bi-file-medical', actions: ['view', 'create', 'upload', 'delete', 'report'] },
  { key: 'notifications', label: 'Notifications', icon: 'bi-bell', actions: ['view', 'create', 'edit', 'delete', 'send'] },
  { key: 'machines', label: 'Machine Integration', icon: 'bi-hdd-network', actions: ['view', 'create', 'edit'] },
  { key: 'hr', label: 'Employees / HR', icon: 'bi-person-badge', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'payroll', label: 'Payroll', icon: 'bi-cash-coin', actions: ['view', 'create', 'edit', 'delete', 'approve'] },
  { key: 'accounting', label: 'Accounting', icon: 'bi-journal-bookmark', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'company', label: 'Company / Financial Year', icon: 'bi-building-gear', actions: ['view', 'create', 'edit'] },
  { key: 'backup', label: 'Database Backup', icon: 'bi-database-down', actions: ['view', 'create', 'delete'] },
  { key: 'branches', label: 'Branches', icon: 'bi-diagram-3', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'settings', label: 'Settings', icon: 'bi-gear', actions: ['view', 'edit'] },
  { key: 'audit', label: 'Audit', icon: 'bi-journal-text', actions: ['view'] },
];

function code(moduleKey, action) {
  return `${moduleKey}.${action}`;
}

function allCodes() {
  const codes = [];
  for (const mod of MODULES) {
    for (const action of mod.actions) {
      codes.push(code(mod.key, action));
    }
  }
  return codes;
}

function viewOnlyCodes() {
  return MODULES.filter((m) => m.actions.includes('view')).map((m) => code(m.key, 'view'));
}

module.exports = {
  MODULES,
  code,
  allCodes,
  viewOnlyCodes,
  totalCount: allCodes().length,
};
