const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireKind, signKindToken } = require('../middleware/kindAuth');
const { writeAudit } = require('../utils/audit');
const { buildRoleDefinitions } = require('../config/roleDefinitions');
const { clearAuthCache } = require('../middleware/auth');
const { createDatabaseBackup, listBackups, deleteBackup, getBackupPath } = require('../utils/backup');

// Platform console. A developer sits above every hospital: onboards tenants, assigns
// subscriptions, suspends/reactivates, and manages the plan catalogue.
// Mirrors DeveloperController from the original app, but with real credentials
// (the original's demo login accepted any email).
const router = express.Router();

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES) || 15;
const BILLING_CYCLES = ['Monthly', 'Yearly'];
const STATUS_FILTERS = ['All', 'Active', 'Expiring Soon', 'Expired', 'Suspended'];
const EXPIRING_DAYS = 30;

const requireDeveloper = requireKind('developer');

// ==================== Auth ====================

// POST /api/developer/login { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const found = await pool.query(`SELECT * FROM platform_developers WHERE LOWER(email) = LOWER($1)`, [email]);
  const dev = found.rows[0];
  const invalid = () => res.status(401).json({ message: 'Invalid email or password.' });
  if (!dev) return invalid();
  if (!dev.is_active) return res.status(403).json({ message: 'This developer account is deactivated.' });
  if (dev.locked_until && new Date(dev.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(dev.locked_until) - new Date()) / 60000);
    return res.status(423).json({ message: `Account locked. Try again in ${minutesLeft} minute(s).` });
  }

  if (!(await bcrypt.compare(password, dev.password_hash))) {
    const attempts = dev.failed_login_attempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await pool.query(`UPDATE platform_developers SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, new Date(Date.now() + LOCKOUT_MINUTES * 60000), dev.id]);
      return res.status(423).json({ message: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.` });
    }
    await pool.query(`UPDATE platform_developers SET failed_login_attempts = $1 WHERE id = $2`, [attempts, dev.id]);
    return invalid();
  }

  await pool.query(`UPDATE platform_developers SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`, [dev.id]);
  const developer = { id: dev.id, name: dev.full_name, email: dev.email, role: dev.role };
  const token = signKindToken({ kind: 'developer', ...developer }, process.env.JWT_EXPIRES_IN || '8h');
  res.json({ token, tokenType: 'Bearer', developer });
});

// POST /api/developer/change-password { currentPassword, newPassword }
// The seeded developer account ships with a demo password; this is how it gets replaced.
router.post('/change-password', requireDeveloper, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ message: 'Current password and a new password are required.' });
  }
  if (newPassword.length < 10 || newPassword.length > 72) {
    return res.status(400).json({ message: 'The new password must be 10 to 72 characters.' }); // bcrypt only reads the first 72 bytes
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ message: 'The new password must contain letters and numbers.' });
  }

  const found = await pool.query(`SELECT * FROM platform_developers WHERE id = $1 AND is_active`, [req.principal.id]);
  const dev = found.rows[0];
  if (!dev) return res.status(404).json({ message: 'Developer account not found.' });
  if (dev.locked_until && new Date(dev.locked_until) > new Date()) return res.status(423).json({ message: 'Account is locked. Try again later.' });

  if (!(await bcrypt.compare(currentPassword, dev.password_hash))) {
    // Wrong current passwords count toward the same lockout as sign-in, so a stolen session cannot guess it.
    const attempts = dev.failed_login_attempts + 1;
    await pool.query(`UPDATE platform_developers SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [attempts, attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null, dev.id]);
    return res.status(400).json({ message: 'Current password is incorrect.' });
  }
  if (await bcrypt.compare(newPassword, dev.password_hash)) {
    return res.status(400).json({ message: 'The new password must be different from the current one.' });
  }

  await pool.query(`UPDATE platform_developers SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
    [await bcrypt.hash(newPassword, 10), dev.id]);
  res.json({ message: 'Password changed successfully.' });
});

router.get('/me', requireDeveloper, (req, res) => {
  const { id, name, email, role } = req.principal;
  res.json({ developer: { id, name, email, role } });
});

// ==================== Helpers ====================

// Derived subscription state, kept in SQL so list filtering and counts agree.
const STATE_SQL = `
  CASE
    WHEN h.status = 'Suspended' THEN 'Suspended'
    WHEN h.subscription_expiry IS NOT NULL AND h.subscription_expiry < CURRENT_DATE THEN 'Expired'
    WHEN h.subscription_expiry IS NOT NULL AND h.subscription_expiry <= CURRENT_DATE + ${EXPIRING_DAYS} THEN 'Expiring Soon'
    ELSE 'Active'
  END`;

const HOSPITAL_SELECT = `
  SELECT h.*, ${STATE_SQL} AS subscription_state,
         p.name AS plan_name, p.max_users, p.max_branches,
         (SELECT COUNT(*) FROM users u WHERE u.hospital_id = h.id)::int AS user_count,
         (SELECT COUNT(*) FROM branches b WHERE b.hospital_id = h.id)::int AS branch_count
  FROM hospitals h LEFT JOIN subscription_plans p ON p.id = h.plan_id`;

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
const iso = (d) => d.toISOString().slice(0, 10);

function monthsFor(billingCycle, months) {
  return billingCycle === 'Yearly' ? 12 : Math.max(1, Number(months) || 1);
}

async function audit(req, hospitalId, action, details, severity = 'Info') {
  await writeAudit({
    hospitalId, userId: null, userName: req.principal.name, role: `Platform: ${req.principal.role}`,
    action, module: 'Platform', details, severity, ip: req.ip,
  });
}

// ==================== Dashboard ====================

router.get('/summary', requireDeveloper, async (req, res) => {
  const hospitals = await pool.query(`SELECT ${STATE_SQL} AS state FROM hospitals h`);
  const counts = { total: hospitals.rows.length, active: 0, expiringSoon: 0, expired: 0, suspended: 0 };
  for (const { state } of hospitals.rows) {
    if (state === 'Active') counts.active += 1;
    else if (state === 'Expiring Soon') counts.expiringSoon += 1;
    else if (state === 'Expired') counts.expired += 1;
    else if (state === 'Suspended') counts.suspended += 1;
  }
  const byPlan = await pool.query(
    `SELECT p.id, p.name, COUNT(h.id)::int AS hospitals
     FROM subscription_plans p LEFT JOIN hospitals h ON h.plan_id = p.id
     GROUP BY p.id ORDER BY p.monthly_price ASC`
  );
  const totalUsers = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
  res.json({ ...counts, totalUsers: totalUsers.rows[0].n, byPlan: byPlan.rows });
});

// ==================== Hospitals ====================

router.get('/hospitals', requireDeveloper, async (req, res) => {
  const { search = '', status = 'All' } = req.query;
  const result = await pool.query(
    `SELECT * FROM (${HOSPITAL_SELECT}) x
     WHERE (x.name ILIKE $1 OR x.code ILIKE $1 OR x.city ILIKE $1)
       AND ($2 = 'All' OR x.subscription_state = $2)
     ORDER BY x.created_on DESC`,
    [`%${search}%`, STATUS_FILTERS.includes(status) ? status : 'All']
  );
  res.json({ hospitals: result.rows, statusFilters: STATUS_FILTERS });
});

router.get('/hospitals/:id', requireDeveloper, async (req, res) => {
  const result = await pool.query(`${HOSPITAL_SELECT} WHERE h.id = $1`, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Hospital not found.' });
  const plans = await pool.query(`SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY monthly_price ASC`);
  res.json({ hospital: result.rows[0], plans: plans.rows, billingCycles: BILLING_CYCLES });
});

function validateHospital(b, { creating }) {
  const errors = {};
  const req = (k, label) => { if (!String(b[k] || '').trim()) errors[k] = `${label} is required.`; };
  req('name', 'Hospital name');
  req('city', 'City');
  req('state', 'State');
  req('contactPerson', 'Contact person');
  req('phone', 'Phone');
  req('email', 'Email');
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) errors.email = 'Enter a valid email.';
  // The logo is an <img src>: only an https URL or the app's own logo route is accepted (no javascript:/data: values).
  if (b.logoUrl && !(/^https:\/\/\S+$/.test(String(b.logoUrl)) || /^\/api\/branding\/logo\/\d+(\?v=\d+)?$/.test(String(b.logoUrl))) || String(b.logoUrl || '').length > 500) {
    errors.logoUrl = 'Logo must be an https:// image URL.';
  }
  if (creating) {
    if (!/^[A-Za-z0-9]{3,30}$/.test(String(b.code || '').trim())) errors.code = 'Code must be 3-30 letters or digits.';
    req('superAdminName', 'Super Admin name');
    if (!/^\S+@\S+\.\S+$/.test(String(b.superAdminEmail || '').trim())) errors.superAdminEmail = 'Enter a valid Super Admin email.';
    if (String(b.superAdminPassword || '').length < 8) errors.superAdminPassword = 'Set a temporary password of at least 8 characters.';
    if (!b.planId) errors.planId = 'Select a subscription plan.';
    if (b.billingCycle && !BILLING_CYCLES.includes(b.billingCycle)) errors.billingCycle = 'Invalid billing cycle.';
  }
  return errors;
}

// POST /api/developer/hospitals - onboard a tenant: hospital + roles + default company/FY +
// primary branch + company settings + Super Admin (forced to change the temp password).
router.post('/hospitals', requireDeveloper, async (req, res) => {
  const b = req.body;
  const errors = validateHospital(b, { creating: true });
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });

  const code = b.code.trim().toUpperCase();
  const billingCycle = b.billingCycle || 'Monthly';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query(`SELECT 1 FROM hospitals WHERE UPPER(code) = $1`, [code]);
    if (dup.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Validation failed.', errors: { code: 'This tenant code is already in use.' } });
    }
    const planRes = await client.query(`SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE`, [b.planId]);
    const plan = planRes.rows[0];
    if (!plan) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Validation failed.', errors: { planId: 'Select an active subscription plan.' } });
    }

    const start = new Date();
    const expiry = addMonths(start, monthsFor(billingCycle, 1));
    const hospitalRes = await client.query(
      `INSERT INTO hospitals (name, code, logo_url, address, city, state, pincode, gstin, nabl_number, contact_person, phone, email,
                              status, subscription_plan, plan_id, billing_cycle, subscription_start, subscription_expiry,
                              super_admin_name, super_admin_email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Active',$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [b.name.trim(), code, b.logoUrl || null, b.address?.trim() || null, b.city.trim(), b.state.trim(), b.pincode?.trim() || null,
        b.gstin?.trim() || null, b.nablNumber?.trim() || null, b.contactPerson.trim(), b.phone.trim(), b.email.trim(),
        plan.name, plan.id, billingCycle, iso(start), iso(expiry),
        b.superAdminName.trim(), b.superAdminEmail.trim().toLowerCase(), req.principal.name]
    );
    const hospitalId = hospitalRes.rows[0].id;

    const roleIdByCode = {};
    for (const role of buildRoleDefinitions()) {
      const r = await client.query(
        `INSERT INTO roles (hospital_id, name, code, description, is_system, is_active, permissions)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6) RETURNING id`,
        [hospitalId, role.name, role.codeName, `${role.name} role`, role.isSystem, role.permissions]
      );
      roleIdByCode[role.codeName] = r.rows[0].id;
    }

    const companyRes = await client.query(
      `INSERT INTO companies (hospital_id, name, code, gstin, address, phone, email, is_default, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,TRUE) RETURNING id`,
      [hospitalId, b.name.trim(), `${code}-CO1`, b.gstin?.trim() || null, b.address?.trim() || null, b.phone.trim(), b.email.trim()]
    );
    const companyId = companyRes.rows[0].id;

    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY: Apr-Mar
    await client.query(
      `INSERT INTO financial_years (company_id, fin_year, from_date, to_date, is_current, is_locked)
       VALUES ($1,$2,$3,$4,TRUE,FALSE)`,
      [companyId, `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`, `${fyStart}-04-01`, `${fyStart + 1}-03-31`]
    );

    const branchRes = await client.query(
      `INSERT INTO branches (hospital_id, name, code, city, state, branch_type, is_primary, is_active, company_id)
       VALUES ($1,'Main Lab',$2,$3,$4,'Main Lab',TRUE,TRUE,$5) RETURNING id`,
      [hospitalId, `BR-${code}-01`, b.city.trim(), b.state.trim(), companyId]
    );

    await client.query(
      `INSERT INTO company_settings (hospital_id, name, legal_name, gstin, nabl_number, email, phone, address)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7)`,
      [hospitalId, b.name.trim(), b.gstin?.trim() || null, b.nablNumber?.trim() || null, b.email.trim(), b.phone.trim(), b.address?.trim() || null]
    );

    await client.query(
      `INSERT INTO users (hospital_id, full_name, email, role_id, branch_id, password_hash, designation, is_active, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,'Super Administrator',TRUE,TRUE)`,
      [hospitalId, b.superAdminName.trim(), b.superAdminEmail.trim().toLowerCase(), roleIdByCode.SUPERADMIN, branchRes.rows[0].id,
        await bcrypt.hash(b.superAdminPassword, 10)]
    );

    await client.query('COMMIT');
    await audit(req, hospitalId, 'Onboard Hospital', `${b.name.trim()} (${code}) on ${plan.name}/${billingCycle}`);
    res.status(201).json({ id: hospitalId, code, name: b.name.trim() });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/developer/hospitals/:id - profile only (code, plan and Super Admin credentials are not editable here)
router.put('/hospitals/:id', requireDeveloper, async (req, res) => {
  const b = req.body;
  const errors = validateHospital(b, { creating: false });
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });

  const result = await pool.query(
    `UPDATE hospitals SET name=$1, logo_url=COALESCE($2, logo_url), address=$3, city=$4, state=$5, pincode=$6, gstin=$7, nabl_number=$8,
            contact_person=$9, phone=$10, email=$11
     WHERE id=$12 RETURNING id, name`,
    [b.name.trim(), b.logoUrl || null, b.address?.trim() || null, b.city.trim(), b.state.trim(), b.pincode?.trim() || null,
      b.gstin?.trim() || null, b.nablNumber?.trim() || null, b.contactPerson.trim(), b.phone.trim(), b.email.trim(), req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Hospital not found.' });
  await audit(req, result.rows[0].id, 'Edit Hospital', result.rows[0].name);
  res.json(result.rows[0]);
});

// PATCH /api/developer/hospitals/:id/status { status: 'Active' | 'Suspended' }
router.patch('/hospitals/:id/status', requireDeveloper, async (req, res) => {
  const { status } = req.body;
  if (!['Active', 'Suspended'].includes(status)) return res.status(400).json({ message: 'Unsupported status.' });
  const result = await pool.query(`UPDATE hospitals SET status = $1 WHERE id = $2 RETURNING id, name, status`, [status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Hospital not found.' });
  clearAuthCache(); // suspension must apply to already-signed-in staff at once
  await audit(req, result.rows[0].id, status === 'Suspended' ? 'Suspend Hospital' : 'Reactivate Hospital', result.rows[0].name,
    status === 'Suspended' ? 'Warning' : 'Info');
  res.json(result.rows[0]);
});

// POST /api/developer/hospitals/:id/renew { planId, billingCycle, months }
// Extends from the current expiry when it is still in the future, otherwise from today.
router.post('/hospitals/:id/renew', requireDeveloper, async (req, res) => {
  const { planId, billingCycle = 'Monthly', months } = req.body;
  if (!BILLING_CYCLES.includes(billingCycle)) return res.status(400).json({ message: 'Invalid billing cycle.' });
  const n = monthsFor(billingCycle, months);
  if (!Number.isInteger(n) || n < 1 || n > 60) return res.status(400).json({ message: 'Select a valid duration (1-60 months).' });

  const planRes = await pool.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
  if (!planRes.rows[0]) return res.status(400).json({ message: 'Select a valid plan.' });
  const hospRes = await pool.query(`SELECT * FROM hospitals WHERE id = $1`, [req.params.id]);
  const hospital = hospRes.rows[0];
  if (!hospital) return res.status(404).json({ message: 'Hospital not found.' });

  const today = new Date();
  const current = hospital.subscription_expiry ? new Date(hospital.subscription_expiry) : null;
  const base = current && current > today ? current : today;
  const newExpiry = addMonths(base, n);

  await pool.query(
    `UPDATE hospitals SET plan_id=$1, subscription_plan=$2, billing_cycle=$3, subscription_expiry=$4,
            subscription_start = COALESCE(subscription_start, $5) WHERE id=$6`,
    [planRes.rows[0].id, planRes.rows[0].name, billingCycle, iso(newExpiry), iso(today), hospital.id]
  );
  clearAuthCache();
  await audit(req, hospital.id, 'Renew Subscription', `${planRes.rows[0].name} (${billingCycle}) until ${iso(newExpiry)}`);
  res.json({ planName: planRes.rows[0].name, billingCycle, subscriptionExpiry: iso(newExpiry) });
});

// ==================== Database backups (platform-wide) ====================
// A pg_dump contains every hospital's data, so it lives here and not in the hospital-facing /api/backup.

router.get('/backups', requireDeveloper, (req, res) => {
  res.json({ backups: listBackups() });
});

router.post('/backups', requireDeveloper, async (req, res) => {
  try {
    res.status(201).json(await createDatabaseBackup());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/backups/:fileName/download', requireDeveloper, (req, res) => {
  try {
    res.download(getBackupPath(req.params.fileName));
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.delete('/backups/:fileName', requireDeveloper, (req, res) => {
  try {
    deleteBackup(req.params.fileName);
    res.json({ message: 'Backup deleted.' });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

// ==================== Plans ====================

router.get('/plans', requireDeveloper, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, (SELECT COUNT(*) FROM hospitals h WHERE h.plan_id = p.id)::int AS subscriber_count
     FROM subscription_plans p ORDER BY p.monthly_price ASC`
  );
  res.json({ plans: result.rows });
});

function mapPlan(b) {
  const features = Array.isArray(b.features)
    ? b.features
    : String(b.featuresText || '').split(/\r?\n/);
  return {
    name: String(b.name || '').trim(),
    code: String(b.code || '').trim().toUpperCase(),
    tagline: String(b.tagline || '').trim() || null,
    monthlyPrice: Number(b.monthlyPrice),
    yearlyPrice: Number(b.yearlyPrice),
    maxUsers: Number(b.maxUsers),
    maxBranches: Number(b.maxBranches),
    maxTestsPerMonth: Number(b.maxTestsPerMonth),
    features: features.map((f) => String(f).trim()).filter(Boolean),
    isPopular: !!b.isPopular,
    isActive: b.isActive === undefined ? true : !!b.isActive,
  };
}

function validatePlan(p) {
  const errors = {};
  if (!p.name) errors.name = 'Plan name is required.';
  if (!/^[A-Z0-9_-]{2,30}$/.test(p.code)) errors.code = 'Code must be 2-30 letters, digits, - or _.';
  if (!(p.monthlyPrice >= 0)) errors.monthlyPrice = 'Enter a valid monthly price.';
  if (!(p.yearlyPrice >= 0)) errors.yearlyPrice = 'Enter a valid yearly price.';
  if (!(p.maxUsers >= 1)) errors.maxUsers = 'Max users must be at least 1.';
  if (!(p.maxBranches >= 1)) errors.maxBranches = 'Max branches must be at least 1.';
  if (!(p.maxTestsPerMonth >= 1)) errors.maxTestsPerMonth = 'Max tests per month must be at least 1.';
  return errors;
}

router.post('/plans', requireDeveloper, async (req, res) => {
  const p = mapPlan(req.body);
  const errors = validatePlan(p);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });
  try {
    const result = await pool.query(
      `INSERT INTO subscription_plans (name, code, tagline, monthly_price, yearly_price, max_users, max_branches, max_tests_per_month, features, is_popular, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [p.name, p.code, p.tagline, p.monthlyPrice, p.yearlyPrice, p.maxUsers, p.maxBranches, p.maxTestsPerMonth, p.features, p.isPopular, p.isActive]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Validation failed.', errors: { code: 'This plan code is already in use.' } });
    throw err;
  }
});

router.put('/plans/:id', requireDeveloper, async (req, res) => {
  const p = mapPlan(req.body);
  const errors = validatePlan(p);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });
  try {
    const result = await pool.query(
      `UPDATE subscription_plans SET name=$1, code=$2, tagline=$3, monthly_price=$4, yearly_price=$5, max_users=$6, max_branches=$7,
              max_tests_per_month=$8, features=$9, is_popular=$10, is_active=$11 WHERE id=$12 RETURNING *`,
      [p.name, p.code, p.tagline, p.monthlyPrice, p.yearlyPrice, p.maxUsers, p.maxBranches, p.maxTestsPerMonth, p.features, p.isPopular, p.isActive, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Plan not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Validation failed.', errors: { code: 'This plan code is already in use.' } });
    throw err;
  }
});

// PATCH /api/developer/plans/:id/active { isActive } - never leave the platform without a sellable plan
router.patch('/plans/:id/active', requireDeveloper, async (req, res) => {
  const isActive = !!req.body.isActive;
  if (!isActive) {
    const others = await pool.query(`SELECT COUNT(*)::int AS n FROM subscription_plans WHERE is_active = TRUE AND id <> $1`, [req.params.id]);
    if (others.rows[0].n < 1) return res.status(400).json({ message: 'At least one plan must stay available for new subscriptions.' });
  }
  const result = await pool.query(`UPDATE subscription_plans SET is_active = $1 WHERE id = $2 RETURNING *`, [isActive, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Plan not found.' });
  res.json(result.rows[0]);
});

module.exports = router;
