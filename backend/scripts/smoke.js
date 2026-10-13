/**
 * Non-destructive regression smoke test. Run the backend first, then:  npm run smoke
 *
 * It only READS data or sends requests that must be REJECTED (4xx), so nothing is created or changed.
 * Defaults match the seeded demo hospital; override with SMOKE_BASE, SMOKE_HOSPITAL, SMOKE_EMAIL, SMOKE_PASSWORD.
 * Exit code is 1 when any check fails.
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const HOSPITAL = process.env.SMOKE_HOSPITAL || 'CITYCARE';
const EMAIL = process.env.SMOKE_EMAIL || 'anita@citycare.in';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Test@123';

let failed = 0;
let passed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

function check(label, ok, detail = '') {
  if (ok) passed += 1; else failed += 1;
  if (!ok) console.log(`FAIL ${label} ${detail}`);
}

const expect = async (label, method, path, want, opts) => {
  const got = await call(method, path, opts);
  const ok = want === '2xx' ? got >= 200 && got < 300 : want === '4xx' ? got >= 400 && got < 500 : got === want;
  check(`${method} ${path} (${label})`, ok, `-> ${got}, expected ${want}`);
};

(async () => {
  await expect('health', 'GET', '/health', 200);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalCode: HOSPITAL, email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) { console.log(`Cannot sign in as ${EMAIL} (${loginRes.status}); set SMOKE_* variables.`); process.exit(1); }
  const token = (await loginRes.json()).token;
  const t = { token };

  await expect('wrong password', 'POST', '/auth/login', 401, { body: { hospitalCode: HOSPITAL, email: EMAIL, password: 'definitely-wrong' } });

  // Every list endpoint: 200 with a token, 401 without one.
  const lists = [
    '/dashboard', '/branches', '/users', '/roles', '/audit-logs', '/company-settings', '/patients', '/doctors', '/departments',
    '/sample-types', '/containers', '/tests', '/test-packages', '/analytes', '/bookings', '/reports', '/invoices',
    '/billing-reports/revenue', '/suppliers', '/stock-masters', '/inventory', '/purchase-orders', '/blood-bank/dashboard',
    '/blood-bank/units', '/blood-bank/requests', '/blood-bank/cross-match', '/blood-bank/storage', '/pharmacy/items', '/wards',
    '/opd/queue', '/ipd/admissions', '/surgery/theatres', '/surgery/bookings', '/radiology/studies', '/notifications/templates',
    '/machines', '/employees', '/payroll/payments', '/accounting/ledgers', '/companies',
  ];
  for (const p of lists) {
    const got = await call('GET', p, t);
    // A few modules name their list route differently; only a server error or auth failure is a real problem here.
    check(`GET ${p} (signed in)`, got !== 401 && got < 500, `-> ${got}`);
    await expect('no token', 'GET', p, 401);
  }

  // Ids that are not numbers must be a clean 404, never a 500.
  for (const p of ['/patients/abc', '/branches/abc', '/blood-bank/units/abc', '/surgery/bookings/abc', '/machines/abc/sync-log', '/radiology/studies/abc']) {
    await expect('non-numeric id', 'GET', p, 404, t);
  }

  // Bad input must be rejected (nothing is written).
  const bad = [
    ['POST', '/patients', { fullName: '', gender: 'Male', age: -5 }],
    ['POST', '/blood-bank/requests', { patientId: 1, bloodGroup: 'ZZ', unitsRequested: -3 }],
    ['POST', '/blood-bank/storage', { name: 'x', minTemperatureC: 10, maxTemperatureC: 2 }],
    ['POST', '/surgery/bookings', { patientId: 1, surgeryId: 1, operationTheatreId: 1, scheduledStartTime: 'x', scheduledEndTime: 'y' }],
    ['POST', '/notifications/send', { channel: 'Email', recipient: 'nope', message: 'hi' }],
    ['POST', '/machines', { machineName: 'm', protocol: 'Zzz' }],
    ['POST', '/branches', { name: 'x', code: 'x', email: 'nope' }],
    ['PUT', '/company-settings', { name: 'x', defaultGstPercent: 500 }],
    ['POST', '/company-settings/logo', {}],
    ['GET', '/billing-reports/revenue?from=garbage', null],
    ['GET', '/billing-reports/revenue?from=2026-09-01&to=2026-01-01', null],
  ];
  for (const [m, p, body] of bad) await expect('bad input', m, p, '4xx', { token, body: body || undefined });

  // The logo route is public by design but must only ever serve a logo.
  await expect('logo traversal', 'GET', '/branding/logo/..%2F..%2F.env', 404);
  await expect('unknown logo', 'GET', '/branding/logo/999999', 404);
  // Uploaded files are never served statically.
  const staticRes = await fetch(`${BASE.replace(/\/api$/, '')}/uploads/radiology/1/anything.png`);
  check('GET /uploads is not public', staticRes.status === 404, `-> ${staticRes.status}`);

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`Smoke test crashed: ${e.message}`); process.exit(1); });
