/**
 * Production bootstrap: creates ONLY what an empty platform needs, with no demo hospital and no demo passwords.
 *   - the subscription plan catalogue
 *   - the platform owner (developer) account, from DEVELOPER_EMAIL / DEVELOPER_PASSWORD
 * Hospitals are then onboarded from the developer console. Safe to run on every deploy (everything is "if missing").
 * (Use `npm run seed` instead for a local demo with the CITYCARE sample hospital.)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { PLANS } = require('../config/plans');

async function bootstrap() {
  const email = (process.env.DEVELOPER_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEVELOPER_PASSWORD || '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of PLANS) {
      await client.query(
        `INSERT INTO subscription_plans (name, code, tagline, monthly_price, yearly_price, max_users, max_branches, max_tests_per_month, features, is_popular, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) ON CONFLICT (code) DO NOTHING`,
        [p.name, p.code, p.tagline, p.monthly, p.yearly, p.users, p.branches, p.tests, p.features, p.popular]
      );
    }
    console.log(`Plans ready: ${PLANS.length}`);

    // The account named by DEVELOPER_EMAIL is created when missing. An existing account is never modified here
    // (its password is changed from /developer/account), so redeploying cannot reset a password.
    const existing = await client.query('SELECT COUNT(*)::int AS n FROM platform_developers');
    const mine = email ? await client.query('SELECT 1 FROM platform_developers WHERE LOWER(email) = $1', [email]) : { rows: [] };
    if (mine.rows[0]) {
      console.log(`Developer account ${email} already exists; not changing it.`);
    } else if (!email && existing.rows[0].n > 0) {
      console.log('Developer account(s) already exist; DEVELOPER_EMAIL not set, nothing to add.');
    } else if (!email || password.length < 10) {
      throw new Error('Set DEVELOPER_EMAIL and DEVELOPER_PASSWORD (at least 10 characters) to create the developer account.');
    } else {
      await client.query(
        `INSERT INTO platform_developers (full_name, email, password_hash, role) VALUES ($1,$2,$3,'Platform Owner')`,
        [process.env.DEVELOPER_NAME || 'Platform Owner', email, await bcrypt.hash(password, 10)]
      );
      console.log(`Developer account created: ${email}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
