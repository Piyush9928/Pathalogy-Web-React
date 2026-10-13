// Sidebar navigation config - mirrors Views/Shared/_Layout.cshtml nav sections.
// Phase 1 wires up: Overview (Dashboard) and System (Administration: Branches, Users, Roles,
// Audit Logs, Company Settings). Later phases will populate the remaining sections
// (Front Desk, Clinical & Inpatient, Hospital Services, Laboratory, Blood Bank, Business,
// Advanced Features) as those modules are built - kept here as disabled placeholders so the
// full sidebar structure/order matches the original from day one.

export const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'bi-grid-1x2-fill', path: '/dashboard', permission: 'dashboard.view' },
    ],
  },
  {
    title: 'Front Desk',
    items: [
      { label: 'Patients', icon: 'bi-people-fill', path: '/patients', permission: 'patients.view' },
      { label: 'Bookings', icon: 'bi-journal-medical', path: '/bookings', permission: 'bookings.view' },
      { label: 'Health Packages', icon: 'bi-gift-fill', path: '/health-packages', comingSoon: true, permission: 'bookings.view' },
      { label: 'Doctors', icon: 'bi-person-vcard', path: '/doctors', permission: 'doctors.view' },
      { label: 'OPD Queue', icon: 'bi-ticket-perforated-fill', path: '/opd', permission: 'opd.view' },
    ],
  },
  {
    title: 'Clinical & Inpatient',
    items: [
      { label: 'Visual Bed Board', icon: 'bi-grid-3x3-gap-fill', path: '/ipd/bed-board', permission: 'ipd.view' },
      { label: 'IPD Admissions', icon: 'bi-hospital-fill', path: '/ipd/admissions', permission: 'ipd.view' },
      { label: 'Wards', icon: 'bi-diagram-3-fill', path: '/ipd/wards', permission: 'ipd.view' },
      { label: 'Surgery / OT', icon: 'bi-bandaid-fill', path: '/surgery', permission: 'surgery.view' },
    ],
  },
  {
    title: 'Laboratory',
    items: [
      { label: 'Reports', icon: 'bi-file-earmark-medical-fill', path: '/reports', permission: 'reports.view' },
      { label: 'Test Master', icon: 'bi-droplet-fill', path: '/laboratory', permission: 'tests.view' },
      { label: 'Radiology', icon: 'bi-file-medical-fill', path: '/radiology', permission: 'radiology.view' },
    ],
  },
  {
    title: 'Blood Bank',
    items: [
      { label: 'Blood Management', icon: 'bi-droplet-half', path: '/blood-bank', permission: 'bloodbank.view' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Billing', icon: 'bi-receipt-cutoff', path: '/billing', permission: 'billing.view' },
      { label: 'Inventory', icon: 'bi-box2-heart-fill', path: '/inventory', permission: 'inventory.view' },
      { label: 'Pharmacy Store', icon: 'bi-capsule', path: '/pharmacy', permission: 'pharmacy.view' },
    ],
  },
  {
    title: 'Administration & Enterprise',
    items: [
      { label: 'Employees / HR', icon: 'bi-person-badge', path: '/hr', permission: 'hr.view' },
      { label: 'Payroll', icon: 'bi-cash-coin', path: '/payroll', permission: 'payroll.view' },
      { label: 'Accounting', icon: 'bi-journal-bookmark', path: '/accounting', permission: 'accounting.view' },
      { label: 'Bank Reconciliation', icon: 'bi-bank', path: '/bank-reconciliation', permission: 'accounting.view' },
      { label: 'Opening Balances', icon: 'bi-clipboard-data', path: '/opening-balances', permission: 'accounting.view' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', icon: 'bi-bell-fill', path: '/notifications', permission: 'notifications.view' },
      { label: 'Machine Integration', icon: 'bi-hdd-network-fill', path: '/machines', permission: 'machines.view' },
      { label: 'Administration', icon: 'bi-sliders2', path: '/admin', admin: true },
    ],
  },
];

// Tabs of the Administration area; each needs its own permission.
export const ADMIN_TABS = [
  { path: '/admin', label: 'Company Settings', icon: 'bi-building', end: true, permission: 'settings.view' },
  { path: '/admin/branches', label: 'Branches', icon: 'bi-diagram-3', permission: 'branches.view' },
  { path: '/admin/users', label: 'Users', icon: 'bi-people', permission: 'users.view' },
  { path: '/admin/roles', label: 'Roles & Permissions', icon: 'bi-shield-lock', permission: 'roles.view' },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'bi-journal-text', permission: 'audit.view' },
  { path: '/admin/companies', label: 'Companies & Financial Years', icon: 'bi-building-gear', permission: 'company.view' },
  { path: '/admin/backup', label: 'Backup & Export', icon: 'bi-database-down', permission: 'backup.view' },
];

/** First Administration tab this user may open, or null. */
export function firstAdminPath(hasPermission) {
  return ADMIN_TABS.find((tab) => hasPermission(tab.permission))?.path || null;
}

// Which permission a page needs, matched on the longest path prefix. The sidebar hides what the user cannot open;
// this is the same rule applied to typed-in / bookmarked URLs (ProtectedRoute).
const ROUTE_PERMISSIONS = [
  ...ADMIN_TABS.map((tab) => [tab.path, tab.permission]),
  ...NAV_SECTIONS.flatMap((section) => section.items.filter((item) => item.permission).map((item) => [item.path, item.permission])),
  ['/billing', 'billing.view'],
  ['/ipd', 'ipd.view'],
  ['/surgery', 'surgery.view'],
];

export function permissionForPath(pathname) {
  let best = null;
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!best || prefix.length > best[0].length) best = [prefix, permission];
    }
  }
  return best ? best[1] : null;
}

/** Where to send a user who has no access to the page they asked for: their first menu item they can open. */
export function firstAllowedPath(hasPermission) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.comingSoon) continue;
      if (item.admin ? firstAdminPath(hasPermission) : hasPermission(item.permission)) {
        return item.admin ? firstAdminPath(hasPermission) : item.path;
      }
    }
  }
  return null;
}
