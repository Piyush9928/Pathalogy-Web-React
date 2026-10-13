const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { computeFlag, resolveAnalyteRange } = require('../utils/resultFlagging');
const { dispatchNotification } = require('../utils/notifications');
const { isPositiveInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// Every :id in this router must be a positive integer, so a text id is a 404 instead of a database error.
router.param('id', (req, res, next, id) => (isPositiveInt(id) ? next() : res.status(404).json({ message: 'Report not found.' })));

const STATUSES = ['Pending', 'Completed', 'Verified', 'Approved', 'Delivered'];

// GET /api/reports?search=&status=
router.get('/', requirePermission('reports.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status = '' } = req.query;

  const conditions = ['b.hospital_id = $1', '(p.full_name ILIKE $2 OR p.uhid ILIKE $2 OR tr.report_number ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (status) { params.push(status); conditions.push(`tr.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT tr.*, b.booking_number, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age, d.full_name AS doctor_name
     FROM test_reports tr
     JOIN bookings b ON b.id = tr.booking_id
     JOIN patients p ON p.id = b.patient_id
     LEFT JOIN doctors d ON d.id = b.doctor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY tr.created_on DESC`,
    params
  );

  const statsRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE tr.status = 'Pending') AS pending,
       COUNT(*) FILTER (WHERE tr.status = 'Completed') AS awaiting_verification,
       COUNT(*) FILTER (WHERE tr.status IN ('Verified', 'Approved', 'Delivered')) AS completed,
       COUNT(*) FILTER (WHERE tr.has_critical_result) AS critical
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id WHERE b.hospital_id = $1`,
    [hospitalId]
  );

  res.json({ reports: result.rows, stats: statsRes.rows[0], statuses: STATUSES });
});

// GET /api/reports/:id - full report incl. result rows
router.get('/:id', requirePermission('reports.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const reportRes = await pool.query(
    `SELECT tr.*, b.booking_number, b.booking_date, p.full_name AS patient_name, p.uhid AS patient_uhid,
            p.gender, p.age, d.full_name AS doctor_name
     FROM test_reports tr
     JOIN bookings b ON b.id = tr.booking_id
     JOIN patients p ON p.id = b.patient_id
     LEFT JOIN doctors d ON d.id = b.doctor_id
     WHERE tr.id = $1 AND b.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!reportRes.rows[0]) return res.status(404).json({ message: 'Report not found.' });

  const resultsRes = await pool.query(
    `SELECT * FROM report_results WHERE report_id = $1 ORDER BY display_order ASC, id ASC`,
    [id]
  );

  res.json({ report: reportRes.rows[0], results: resultsRes.rows, statuses: STATUSES });
});

// GET /api/reports/:id/entry-form - booked tests -> candidate analytes, with auto-populated
// unit/reference range/flag based on the patient's gender+age (fixes the original's gender bug)
router.get('/:id/entry-form', requirePermission('reports.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const reportRes = await pool.query(
    `SELECT tr.*, b.id AS booking_id, p.gender, p.age
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id JOIN patients p ON p.id = b.patient_id
     WHERE tr.id = $1 AND b.hospital_id = $2`,
    [id, hospitalId]
  );
  const report = reportRes.rows[0];
  if (!report) return res.status(404).json({ message: 'Report not found.' });

  // Existing saved results, if any (editing an already-started entry)
  const existingRes = await pool.query(`SELECT * FROM report_results WHERE report_id = $1 ORDER BY display_order ASC`, [id]);
  if (existingRes.rows.length > 0) {
    return res.json({ rows: existingRes.rows, patient: { gender: report.gender, age: report.age } });
  }

  // First time opening entry: seed one row per analyte linked to each booked test.
  const analytesRes = await pool.query(
    `SELECT bt.id AS booking_test_id, t.id AS test_id, t.name AS test_name,
            a.id AS analyte_id, a.analyte_name, a.short_name, a.unit, a.reference_range,
            a.critical_low, a.critical_high, a.result_type, a.predefined_values, ta.display_order
     FROM booking_tests bt
     JOIN tests t ON t.id = bt.test_id
     LEFT JOIN test_analytes ta ON ta.test_id = t.id
     LEFT JOIN analytes a ON a.id = ta.analyte_id
     WHERE bt.booking_id = $1
     ORDER BY t.name ASC, ta.display_order ASC`,
    [report.booking_id]
  );

  const rows = [];
  for (const row of analytesRes.rows) {
    if (!row.analyte_id) {
      // No analyte linked to this test yet (Phase 3 gap) - fall back to a single free-text row per test.
      rows.push({
        booking_test_id: row.booking_test_id, analyte_id: null, analyte_name: row.test_name,
        value: '', unit: '', reference_range: '', flag: 'Normal', is_calculated: false, formula: null,
      });
      continue;
    }

    const bandsRes = await pool.query(`SELECT * FROM analyte_reference_bands WHERE analyte_id = $1`, [row.analyte_id]);
    const resolved = resolveAnalyteRange(row, bandsRes.rows, report.gender, report.age);

    rows.push({
      booking_test_id: row.booking_test_id, analyte_id: row.analyte_id, analyte_name: row.analyte_name,
      value: '', unit: resolved.unit, reference_range: resolved.referenceRange, flag: 'Normal',
      is_calculated: false, formula: null, result_type: row.result_type, predefined_values: row.predefined_values,
    });
  }

  res.json({ rows, patient: { gender: report.gender, age: report.age } });
});

// ---- Write-route helpers ----
const FLAGS = ['Normal', 'Low', 'High', 'Critical'];
const MAX_RESULT_ROWS = 300;
// The hand-drawn signature pad produces a small PNG data URL. Anything else (a script URL, a huge blob) is refused.
const SIGNATURE_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE_CHARS = 200000;

// A report belongs to a hospital through its booking. Every write goes through this check.
async function loadReport(client, hospitalId, id, { lock = false } = {}) {
  const res = await client.query(
    `SELECT tr.* FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id
     WHERE tr.id = $1 AND b.hospital_id = $2${lock ? ' FOR UPDATE OF tr' : ''}`,
    [id, hospitalId]
  );
  return res.rows[0] || null;
}

// PUT /api/reports/:id/results { results: [{bookingTestId, analyteId, analyteName, value, unit, referenceRange, isCalculated, formula}] }
router.put('/:id/results', requirePermission('reports.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { results } = req.body;

  if (!Array.isArray(results) || results.length === 0) return res.status(400).json({ message: 'Enter at least one result.' });
  if (results.length > MAX_RESULT_ROWS) return res.status(400).json({ message: `A report can have at most ${MAX_RESULT_ROWS} result rows.` });

  for (const [i, r] of results.entries()) {
    const n = i + 1;
    if (!String(r.analyteName || '').trim() || String(r.analyteName).length > 200) return res.status(400).json({ message: `Row ${n}: an analyte name of up to 200 characters is required.` });
    if (r.value !== undefined && r.value !== null && String(r.value).length > 200) return res.status(400).json({ message: `Row ${n}: the result value is too long.` });
    if (r.unit && String(r.unit).length > 50) return res.status(400).json({ message: `Row ${n}: unit is too long.` });
    if (r.referenceRange && String(r.referenceRange).length > 200) return res.status(400).json({ message: `Row ${n}: reference range is too long.` });
    if (r.formula && String(r.formula).length > 200) return res.status(400).json({ message: `Row ${n}: formula is too long.` });
    if (r.flag !== undefined && !FLAGS.includes(r.flag)) return res.status(400).json({ message: `Row ${n}: invalid flag.` });
    if (r.bookingTestId && !isPositiveInt(r.bookingTestId)) return res.status(400).json({ message: `Row ${n}: invalid booked test.` });
    if (r.analyteId && !isPositiveInt(r.analyteId)) return res.status(400).json({ message: `Row ${n}: invalid analyte.` });
  }
  // A report with no values is not a result; refuse it rather than moving the report to "Completed" empty.
  if (!results.some((r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== '')) {
    return res.status(400).json({ message: 'Enter at least one result value.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await loadReport(client, hospitalId, id, { lock: true });
    if (!report) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Report not found.' });
    }
    // Once verified or approved the results are signed off; changing them needs an explicit reopen (which is audited).
    if (!['Pending', 'Completed'].includes(report.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `This report is ${report.status}. Reopen it before changing results.` });
    }

    const patientRes = await client.query(
      `SELECT p.gender, p.age FROM bookings b JOIN patients p ON p.id = b.patient_id WHERE b.id = $1`,
      [report.booking_id]
    );
    const patient = patientRes.rows[0];

    // booked tests must belong to THIS report's booking; analytes must be this hospital's own.
    const bookedIds = [...new Set(results.map((r) => r.bookingTestId).filter(Boolean).map(Number))];
    if (bookedIds.length) {
      const own = await client.query(`SELECT COUNT(*)::int AS n FROM booking_tests WHERE booking_id = $1 AND id = ANY($2::int[])`, [report.booking_id, bookedIds]);
      if (own.rows[0].n !== bookedIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'A result row refers to a test that is not part of this booking.' });
      }
    }
    const analyteIds = results.map((r) => r.analyteId).filter(Boolean);
    if (analyteIds.length && !(await idsBelongToHospital(client, 'analytes', hospitalId, analyteIds))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'A result row refers to an analyte that does not exist.' });
    }

    await client.query(`DELETE FROM report_results WHERE report_id = $1`, [id]);

    let hasCritical = false;
    let order = 0;
    for (const r of results) {
      let flag = r.flag || 'Normal';

      // Recompute the flag server-side if this row is linked to a real analyte, using its
      // actual critical thresholds + reference band (never trust the client-submitted flag alone).
      if (r.analyteId) {
        const analyteRes = await client.query(`SELECT * FROM analytes WHERE id = $1 AND hospital_id = $2`, [r.analyteId, hospitalId]);
        const analyte = analyteRes.rows[0];
        if (analyte) {
          const bandsRes = await client.query(`SELECT * FROM analyte_reference_bands WHERE analyte_id = $1`, [r.analyteId]);
          const resolved = resolveAnalyteRange(analyte, bandsRes.rows, patient.gender, patient.age);
          flag = computeFlag(r.value, resolved);
        }
      }
      if (flag === 'Critical') hasCritical = true;

      await client.query(
        `INSERT INTO report_results (report_id, booking_test_id, analyte_id, analyte_name, value, unit, reference_range, flag, is_calculated, formula, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, r.bookingTestId || null, r.analyteId || null, String(r.analyteName).trim(), r.value === undefined || r.value === null ? null : String(r.value), r.unit, r.referenceRange, flag, r.isCalculated === true, r.formula || null, order++]
      );
    }

    const newStatus = report.status === 'Pending' ? 'Completed' : report.status;
    await client.query(
      `UPDATE test_reports SET status = $1, entered_by = $2, entered_on = NOW(), has_critical_result = $3 WHERE id = $4`,
      [newStatus, name, hasCritical, id]
    );

    await client.query('COMMIT');

    if (hasCritical) {
      await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Critical Result Flagged', module: 'Reports', details: `Report ${report.report_number}`, severity: 'Critical', ip: req.ip });
    }

    const updated = await pool.query(`SELECT * FROM test_reports WHERE id = $1`, [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Moves a report between statuses. The UPDATE is scoped to the caller's hospital through the booking and only
// fires when the report is currently in `fromStatuses`, so it is atomic and cannot touch another hospital's report.
async function transition(hospitalId, id, fromStatuses, setSql, params) {
  const result = await pool.query(
    `UPDATE test_reports tr SET ${setSql}
     FROM bookings b
     WHERE tr.id = $1 AND b.id = tr.booking_id AND b.hospital_id = $2 AND tr.status = ANY($3::text[])
     RETURNING tr.*`,
    [id, hospitalId, fromStatuses, ...params]
  );
  return result.rows[0] || null;
}

// POST /api/reports/:id/verify
router.post('/:id/verify', requirePermission('reports.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const report = await transition(hospitalId, id, ['Completed'], `status = 'Verified', verified_by = $4, verified_on = NOW()`, [name]);
  if (!report) return res.status(400).json({ message: 'Report must be in Completed status to verify.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Verify Report', module: 'Reports', details: report.report_number, ip: req.ip });
  res.json(report);
});

// POST /api/reports/:id/approve { signatureDataUrl }
router.post('/:id/approve', requirePermission('reports.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { signatureDataUrl } = req.body;

  if (!signatureDataUrl) return res.status(400).json({ message: 'A signature is required to approve a report.' });
  if (typeof signatureDataUrl !== 'string' || signatureDataUrl.length > MAX_SIGNATURE_CHARS || !SIGNATURE_RE.test(signatureDataUrl)) {
    return res.status(400).json({ message: 'The signature must be a PNG or JPEG image.' });
  }

  const report = await transition(hospitalId, id, ['Verified'], `status = 'Approved', approved_by = $4, approved_on = NOW(), signature_data_url = $5`, [name, signatureDataUrl]);
  if (!report) return res.status(400).json({ message: 'Report must be in Verified status to approve.' });

  // Fixed gap: wires the original's dormant "Report Ready" template to a real trigger,
  // firing the moment a report is approved (that's when it becomes visible/deliverable).
  const patientRes = await pool.query(
    `SELECT p.full_name, p.email, p.phone FROM test_reports tr
     JOIN bookings b ON b.id = tr.booking_id JOIN patients p ON p.id = b.patient_id
     WHERE tr.id = $1`,
    [id]
  );
  const patient = patientRes.rows[0];
  if (patient) {
    await dispatchNotification(pool, {
      hospitalId,
      triggerEvent: 'Report Ready',
      placeholders: { PatientName: patient.full_name, ReportNumber: report.report_number },
      recipient: { email: patient.email, phone: patient.phone },
    });
  }

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Approve Report', module: 'Reports', details: report.report_number, ip: req.ip });
  res.json(report);
});

// POST /api/reports/:id/deliver
router.post('/:id/deliver', requirePermission('reports.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const report = await transition(hospitalId, id, ['Approved'], `status = 'Delivered'`, []);
  if (!report) return res.status(400).json({ message: 'Report must be in Approved status to deliver.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Deliver Report', module: 'Reports', details: report.report_number, ip: req.ip });
  res.json(report);
});

// POST /api/reports/:id/reopen
router.post('/:id/reopen', requirePermission('reports.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const report = await transition(
    hospitalId, id, ['Verified', 'Approved'],
    `status = 'Pending', verified_by = NULL, verified_on = NULL, approved_by = NULL, approved_on = NULL, signature_data_url = NULL`,
    []
  );
  if (!report) return res.status(400).json({ message: 'Only Verified or Approved reports can be reopened.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Reopen Report', module: 'Reports', details: report.report_number, severity: 'Warning', ip: req.ip });
  res.json(report);
});

// PUT /api/reports/:id/notes { notes }
router.put('/:id/notes', requirePermission('reports.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { notes } = req.body;
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 2000)) {
    return res.status(400).json({ message: 'Notes must be text of 2000 characters or fewer.' });
  }

  const result = await pool.query(
    `UPDATE test_reports tr SET notes = $3 FROM bookings b
     WHERE tr.id = $1 AND b.id = tr.booking_id AND b.hospital_id = $2 RETURNING tr.*`,
    [id, hospitalId, notes ?? null]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Report not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Report Notes', module: 'Reports', details: result.rows[0].report_number, ip: req.ip });
  res.json(result.rows[0]);
});

module.exports = router;
