const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

// Hospital data export. Everything here is scoped to the caller's own hospital.
//
// Deviation from the original, flagged: the original's one-click "BACKUP DATABASE" ran against the
// tenant's own database. This rebuild uses ONE shared database (tenant_id per row), so a pg_dump would
// contain every hospital's patients and finances. That whole-database backup is therefore a platform
// operation and lives in the developer console (/api/developer/backups); hospital admins get the JSON /
// CSV exports below, which contain only their own data.
const router = express.Router();
router.use(requireAuth);

// GET /api/backup/export/json - dumps core tables as one JSON file, matches the original's
// ExportJsonDataAsync (Patients/Bookings/TestMasters/Invoices/Doctors/Employees/
// InventoryItems/BloodUnits/last 200 AuditLogs).
router.get('/export/json', requirePermission('backup.view'), async (req, res) => {
  const { hospitalId, name } = req.user;

  const [patients, bookings, tests, invoices, doctors, employees, inventoryItems, bloodUnits, auditLogs] = await Promise.all([
    pool.query(`SELECT * FROM patients WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM bookings WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM tests WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM invoices WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM doctors WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM employees WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM inventory_items WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM blood_units WHERE hospital_id = $1`, [hospitalId]),
    pool.query(`SELECT * FROM audit_logs WHERE hospital_id = $1 ORDER BY created_on DESC LIMIT 200`, [hospitalId]),
  ]);

  const payload = {
    exportedOn: new Date().toISOString(),
    patients: patients.rows, bookings: bookings.rows, tests: tests.rows, invoices: invoices.rows,
    doctors: doctors.rows, employees: employees.rows, inventoryItems: inventoryItems.rows,
    bloodUnits: bloodUnits.rows, auditLogs: auditLogs.rows,
  };

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Export JSON Data', module: 'Backup', details: 'Full data export (JSON)', severity: 'Warning', ip: req.ip });
  res.setHeader('Content-Disposition', `attachment; filename="labsyncpro-export-${Date.now()}.json"`);
  res.json(payload);
});

// A cell starting with = + - @ (or a tab/CR) is run as a formula by Excel / Sheets when the file is
// opened, so a patient named "=HYPERLINK(...)" would execute on the admin's machine. Prefix a quote.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n');
}

// GET /api/backup/export/csv/:table - one CSV at a time (Patients/Bookings/Invoices/Tests/BloodUnits),
// matches the original's ExportCsvZipAsync file set; exposed per-table rather than pre-zipped
// since the client can request/save each one directly.
const CSV_TABLES = {
  patients: 'patients', bookings: 'bookings', invoices: 'invoices', tests: 'tests', 'blood-units': 'blood_units',
};

router.get('/export/csv/:table', requirePermission('backup.view'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const tableName = CSV_TABLES[req.params.table];
  if (!tableName) return res.status(400).json({ message: 'Invalid export table. Choose one of: ' + Object.keys(CSV_TABLES).join(', ') });

  const result = await pool.query(`SELECT * FROM ${tableName} WHERE hospital_id = $1`, [hospitalId]);
  const csv = toCsv(result.rows);

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Export CSV Data', module: 'Backup', details: `${req.params.table}.csv`, ip: req.ip });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.table}.csv"`);
  res.send(csv);
});

module.exports = router;
