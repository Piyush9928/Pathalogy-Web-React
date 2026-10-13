const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Issues a 6-digit one-time code for a doctor/patient portal sign-in.
 * Returns { otp } on success, or { cooldown: true } if one was issued too recently.
 * Only the bcrypt hash is stored. There is no SMS gateway in this build (notifications are
 * simulated, same as the original), so the caller decides whether to expose the code.
 */
async function issueOtp(portal, hospitalId, subjectId) {
  const recent = await pool.query(
    `SELECT 1 FROM portal_otps
     WHERE portal = $1 AND hospital_id = $2 AND subject_id = $3
       AND created_on > NOW() - ($4 || ' seconds')::interval`,
    [portal, hospitalId, subjectId, String(RESEND_COOLDOWN_SECONDS)]
  );
  if (recent.rows[0]) return { cooldown: true };

  await pool.query(
    `UPDATE portal_otps SET consumed = TRUE WHERE portal = $1 AND hospital_id = $2 AND subject_id = $3 AND consumed = FALSE`,
    [portal, hospitalId, subjectId]
  );
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `INSERT INTO portal_otps (portal, hospital_id, subject_id, otp_hash, expires_at)
     VALUES ($1,$2,$3,$4, NOW() + ($5 || ' minutes')::interval)`,
    [portal, hospitalId, subjectId, await bcrypt.hash(otp, 8), String(OTP_TTL_MINUTES)]
  );
  return { otp };
}

/** Checks a code against the latest live OTP. Wrong guesses are counted; the OTP dies after MAX_ATTEMPTS. */
async function verifyOtp(portal, hospitalId, subjectId, otp) {
  const res = await pool.query(
    `SELECT * FROM portal_otps
     WHERE portal = $1 AND hospital_id = $2 AND subject_id = $3 AND consumed = FALSE AND expires_at > NOW()
     ORDER BY created_on DESC LIMIT 1`,
    [portal, hospitalId, subjectId]
  );
  const row = res.rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  if (!(await bcrypt.compare(String(otp), row.otp_hash))) {
    await pool.query(`UPDATE portal_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return false;
  }
  await pool.query(`UPDATE portal_otps SET consumed = TRUE WHERE id = $1`, [row.id]);
  return true;
}

// Only echo the code in the response outside production (no SMS provider is wired up).
const exposeOtp = () => process.env.NODE_ENV !== 'production';

module.exports = { issueOtp, verifyOtp, exposeOtp, OTP_TTL_MINUTES };
