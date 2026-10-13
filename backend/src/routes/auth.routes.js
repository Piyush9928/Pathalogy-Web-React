const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { writeAudit } = require('../utils/audit');
const { requireAuth, clearAuthCache } = require('../middleware/auth');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES) || 15;

// POST /api/auth/login  { hospitalCode, email, password }
// Mirrors AccountController.Login / Api/AuthApiController.Token from the original app.
router.post('/login', async (req, res) => {
  const { hospitalCode, email, password } = req.body;

  if (!hospitalCode || !email || !password) {
    return res.status(400).json({ message: 'Hospital code, email and password are required.' });
  }

  try {
    const hospitalRes = await pool.query(
      `SELECT * FROM hospitals WHERE UPPER(code) = UPPER($1)`,
      [hospitalCode]
    );
    const hospital = hospitalRes.rows[0];
    if (!hospital) {
      return res.status(401).json({ message: 'Invalid hospital code, email or password.' });
    }
    if (hospital.status === 'Suspended') {
      return res.status(403).json({ message: 'This hospital account is suspended.' });
    }
    if (hospital.subscription_expiry && new Date(hospital.subscription_expiry) < new Date(new Date().toDateString())) {
      return res.status(403).json({ message: 'Your subscription has expired. Please contact the platform administrator to renew.' });
    }

    const userRes = await pool.query(
      `SELECT u.*, r.name AS role_name, r.code AS role_code, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.hospital_id = $1 AND LOWER(u.email) = LOWER($2)`,
      [hospital.id, email]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid hospital code, email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated. Contact your administrator.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ message: `Account locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      const attempts = user.failed_login_attempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [attempts, lockedUntil, user.id]
        );
        return res.status(423).json({ message: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.` });
      }
      await pool.query(`UPDATE users SET failed_login_attempts = $1 WHERE id = $2`, [attempts, user.id]);
      return res.status(401).json({
        message: 'Invalid hospital code, email or password.',
        attemptsRemaining: MAX_FAILED_ATTEMPTS - attempts,
      });
    }

    // Success: reset lockout counters, update last login
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    const tokenPayload = {
      userId: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role_name,
      roleCode: user.role_code,
      permissions: user.permissions || [],
      hospitalId: hospital.id,
      hospitalCode: hospital.code,
      hospitalName: hospital.name,
      branchId: user.branch_id,
      mustChangePassword: user.must_change_password,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    await writeAudit({
      hospitalId: hospital.id,
      userId: user.id,
      userName: user.full_name,
      role: user.role_name,
      action: 'Login',
      module: 'Auth',
      details: `${user.full_name} signed in.`,
      severity: 'Info',
      ip: req.ip,
    });

    return res.json({
      token,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role_name,
        permissions: user.permissions || [],
        branchId: user.branch_id,
        mustChangePassword: user.must_change_password,
      },
      hospital: {
        id: hospital.id,
        code: hospital.code,
        name: hospital.name,
        logoUrl: hospital.logo_url,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'An unexpected error occurred during login.' });
  }
});

// GET /api/auth/me - current user profile from JWT claims
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout - client discards token; we just audit the event.
router.post('/logout', requireAuth, async (req, res) => {
  await writeAudit({
    hospitalId: req.user.hospitalId,
    userId: req.user.userId,
    userName: req.user.name,
    role: req.user.role,
    action: 'Logout',
    module: 'Auth',
    details: `${req.user.name} signed out.`,
    ip: req.ip,
  });
  res.json({ message: 'Logged out.' });
});

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Current password and a new password (min 8 chars) are required.' });
  }

  const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) return res.status(400).json({ message: 'Current password is incorrect.' });

  if (await bcrypt.compare(newPassword, user.password_hash)) {
    return res.status(400).json({ message: 'The new password must be different from the current one.' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
    [newHash, user.id]
  );

  clearAuthCache(); // the temporary-password flag lives in the database now; drop any cached copy

  // Re-issue the token: the old one still carries mustChangePassword=true.
  const { iat, exp, ...claims } = req.user; // eslint-disable-line no-unused-vars
  const token = jwt.sign({ ...claims, mustChangePassword: false }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  res.json({ message: 'Password changed successfully.', token });
});

const RESET_TOKEN_TTL_MINUTES = 30;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// POST /api/auth/forgot-password { hospitalCode, email }
// Always answers the same way so it cannot be used to discover which accounts exist.
// No mail gateway is connected (notifications are simulated, as in the original), so outside
// production the reset link token is returned in the response for testing.
router.post('/forgot-password', async (req, res) => {
  const { hospitalCode, email } = req.body;
  if (!hospitalCode || !email) return res.status(400).json({ message: 'Hospital code and email are required.' });

  const body = { message: 'If these details match an account, a password reset link has been sent.' };

  const userRes = await pool.query(
    `SELECT u.id, u.is_active FROM users u JOIN hospitals h ON h.id = u.hospital_id
     WHERE UPPER(h.code) = UPPER($1) AND LOWER(u.email) = LOWER($2) AND h.status <> 'Suspended'`,
    [String(hospitalCode).trim(), String(email).trim()]
  );
  const user = userRes.rows[0];
  if (user && user.is_active) {
    const recent = await pool.query(
      `SELECT 1 FROM password_reset_tokens WHERE user_id = $1 AND created_on > NOW() - INTERVAL '60 seconds'`,
      [user.id]
    );
    if (!recent.rows[0]) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [user.id]);
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, NOW() + ($3 || ' minutes')::interval)`,
        [user.id, sha256(token), String(RESET_TOKEN_TTL_MINUTES)]
      );
      if (process.env.NODE_ENV !== 'production') body.devResetToken = token;
    }
  }
  res.json(body);
});

// POST /api/auth/reset-password { token, newPassword }
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'A reset token and a new password (min 8 chars) are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Consume the token atomically so it cannot be used twice.
    const used = await client.query(
      `UPDATE password_reset_tokens SET used = TRUE
       WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() RETURNING user_id`,
      [sha256(String(token))]
    );
    if (!used.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Request a new one.' });
    }
    const userId = used.rows[0].user_id;
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
      [await bcrypt.hash(newPassword, 10), userId]
    );
    await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1`, [userId]);
    const u = await client.query(`SELECT hospital_id, full_name FROM users WHERE id = $1`, [userId]);
    await client.query('COMMIT');
    clearAuthCache();
    await writeAudit({
      hospitalId: u.rows[0].hospital_id, userId, userName: u.rows[0].full_name, role: null,
      action: 'Password Reset', module: 'Auth', details: 'Password reset via emailed link.', severity: 'Warning', ip: req.ip,
    });
    res.json({ message: 'Password reset. You can now sign in.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
