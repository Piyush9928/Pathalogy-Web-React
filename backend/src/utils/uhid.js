const pool = require('../db/pool');

/**
 * Generates the next sequential UHID for a hospital, using the hospital's configured
 * uhid_prefix from company_settings (falls back to "UHID" if not set).
 * Format: {PREFIX}-{YEAR}-{6-digit sequence}, e.g. UHID-2026-000042.
 * The sequence resets when the calendar year changes (mirrors typical lab UHID schemes).
 *
 * Improvement over the original ASP.NET app: the original hardcoded the literal "UHID"
 * prefix and derived the sequence from the patient row's own auto-increment id, which
 * meant deleting patients could produce non-monotonic-looking gaps and completely ignored
 * the configurable CompanySettings.UhidPrefix field. Here the sequence is tracked
 * independently in uhid_counters so it stays stable regardless of deletions.
 */
async function generateUhid(client, hospitalId) {
  const year = new Date().getFullYear();

  const settingsRes = await client.query(
    `SELECT uhid_prefix FROM company_settings WHERE hospital_id = $1`,
    [hospitalId]
  );
  const prefix = settingsRes.rows[0]?.uhid_prefix || 'UHID';

  const counterRes = await client.query(
    `INSERT INTO uhid_counters (hospital_id, year, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (hospital_id) DO UPDATE SET
       last_number = CASE WHEN uhid_counters.year = $2 THEN uhid_counters.last_number + 1 ELSE 1 END,
       year = $2
     RETURNING last_number`,
    [hospitalId, year]
  );

  const sequence = counterRes.rows[0].last_number;
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

module.exports = { generateUhid };
