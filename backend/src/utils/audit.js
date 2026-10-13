const pool = require('../db/pool');

/**
 * Writes an audit log entry. Mirrors AdminController's private Audit() helper.
 * severity: 'Info' | 'Warning' | 'Critical'
 */
async function writeAudit({ hospitalId, userId, userName, role, action, module, details, severity = 'Info', ip }) {
  await pool.query(
    `INSERT INTO audit_logs (hospital_id, user_id, user_name, role, action, module, details, severity, ip_address, created_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [hospitalId, userId, userName, role, action, module, details, severity, ip]
  );
}

module.exports = { writeAudit };
