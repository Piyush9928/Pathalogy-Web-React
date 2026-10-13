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
      { label: 'Dashboard', icon: 'bi-grid-1x2-fill', path: '/dashboard' },
    ],
  },
  {
    title: 'Front Desk',
    items: [
      { label: 'Patients', icon: 'bi-people-fill', path: '/patients' },
      { label: 'Bookings', icon: 'bi-journal-medical', path: '/bookings' },
      { label: 'Health Packages', icon: 'bi-gift-fill', path: '/health-packages', comingSoon: true },
      { label: 'Doctors', icon: 'bi-person-vcard', path: '/doctors' },
      { label: 'OPD Queue', icon: 'bi-ticket-perforated-fill', path: '/opd' },
    ],
  },
  {
    title: 'Clinical & Inpatient',
    items: [
      { label: 'Visual Bed Board', icon: 'bi-grid-3x3-gap-fill', path: '/ipd/bed-board' },
      { label: 'IPD Admissions', icon: 'bi-hospital-fill', path: '/ipd/admissions' },
      { label: 'Wards', icon: 'bi-diagram-3-fill', path: '/ipd/wards' },
      { label: 'Surgery / OT', icon: 'bi-bandaid-fill', path: '/surgery' },
    ],
  },
  {
    title: 'Laboratory',
    items: [
      { label: 'Reports', icon: 'bi-file-earmark-medical-fill', path: '/reports' },
      { label: 'Test Master', icon: 'bi-droplet-fill', path: '/laboratory' },
      { label: 'Radiology', icon: 'bi-file-medical-fill', path: '/radiology' },
    ],
  },
  {
    title: 'Blood Bank',
    items: [
      { label: 'Blood Management', icon: 'bi-droplet-half', path: '/blood-bank' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Billing', icon: 'bi-receipt-cutoff', path: '/billing' },
      { label: 'Inventory', icon: 'bi-box2-heart-fill', path: '/inventory' },
      { label: 'Pharmacy Store', icon: 'bi-capsule', path: '/pharmacy' },
    ],
  },
  {
    title: 'Administration & Enterprise',
    items: [
      { label: 'Employees / HR', icon: 'bi-person-badge', path: '/hr' },
      { label: 'Payroll', icon: 'bi-cash-coin', path: '/payroll' },
      { label: 'Accounting', icon: 'bi-journal-bookmark', path: '/accounting' },
      { label: 'Bank Reconciliation', icon: 'bi-bank', path: '/bank-reconciliation' },
      { label: 'Opening Balances', icon: 'bi-clipboard-data', path: '/opening-balances' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', icon: 'bi-bell-fill', path: '/notifications' },
      { label: 'Machine Integration', icon: 'bi-hdd-network-fill', path: '/machines' },
      { label: 'Administration', icon: 'bi-sliders2', path: '/admin', roles: ['Super Admin', 'Admin'] },
    ],
  },
];
