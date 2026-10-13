// Subscription plans offered to hospitals. Shared by the demo seed and the production bootstrap.
const PLANS = [
  { name: 'Starter', code: 'STARTER', tagline: 'For a single small lab', monthly: 2999, yearly: 29990, users: 5, branches: 1, tests: 1000, popular: false,
    features: ['Patient registration & UHID', 'Test master & bookings', 'Report generation (PDF)', 'Billing with GST'] },
  { name: 'Professional', code: 'PROFESSIONAL', tagline: 'For growing diagnostic centres', monthly: 7999, yearly: 79990, users: 25, branches: 3, tests: 10000, popular: true,
    features: ['Everything in Starter', 'Blood bank & pharmacy', 'OPD / IPD / Surgery', 'Inventory & purchase orders', 'Notifications'] },
  { name: 'Enterprise', code: 'ENTERPRISE', tagline: 'For hospital groups', monthly: 19999, yearly: 199990, users: 100, branches: 20, tests: 100000, popular: false,
    features: ['Everything in Professional', 'Multi-company & accounting', 'HR & payroll', 'Machine integration', 'Priority support'] },
];

module.exports = { PLANS };
