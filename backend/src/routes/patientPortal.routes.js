const express = require('express');
const pool = require('../db/pool');
const { requireKind, signKindToken } = require('../middleware/kindAuth');
const { issueOtp, verifyOtp, exposeOtp, OTP_TTL_MINUTES } = require('../utils/portalOtp');
const { computeInvoiceTotals } = require('../utils/billing');
const { writeAudit } = require('../utils/audit');

// Patient Portal: a patient's own bookings, reports and invoices. Mirrors PatientPortalController.
// Sign-in is hospital code + UHID + registered mobile + one-time code (the original stopped at UHID + mobile).
const router = express.Router();
const requirePatient = requireKind('patient');

const RELEASED = ['Verified', 'Approved', 'Delivered'];
const GENERIC = 'If these details match a patient record, a one-time code has been sent.';

async function findPatient(hospitalCode, uhid, phone) {
  const h = await pool.query(`SELECT * FROM hospitals WHERE UPPER(code) = UPPER($1)`, [String(hospitalCode || '').trim()]);
  const hospital = h.rows[0];
  if (!hospital || hospital.status === 'Suspended') return null;
  const p = await pool.query(
    `SELECT * FROM patients WHERE hospital_id = $1 AND UPPER(uhid) = UPPER($2) AND phone = $3 AND is_active = TRUE LIMIT 1`,
    [hospital.id, String(uhid || '').trim(), String(phone || '').trim()]
  );
  return p.rows[0] ? { hospital, patient: p.rows[0] } : null;
}

// POST /api/patient-portal/request-otp { hospitalCode, uhid, phone }
router.post('/request-otp', async (req, res) => {
  const { hospitalCode, uhid, phone } = req.body;
  if (!hospitalCode || !uhid || !phone) return res.status(400).json({ message: 'Hospital code, UHID and mobile number are required.' });

  const found = await findPatient(hospitalCode, uhid, phone);
  const body = { message: GENERIC, expiresInMinutes: OTP_TTL_MINUTES };
  if (found) {
    const issued = await issueOtp('patient', found.hospital.id, found.patient.id);
    if (issued.cooldown) return res.status(429).json({ message: 'A code was just sent. Please wait a few seconds before requesting another.' });
    if (exposeOtp()) body.devOtp = issued.otp;
  }
  res.json(body);
});

// POST /api/patient-portal/login { hospitalCode, uhid, phone, otp }
router.post('/login', async (req, res) => {
  const { hospitalCode, uhid, phone, otp } = req.body;
  if (!hospitalCode || !uhid || !phone || !otp) return res.status(400).json({ message: 'Hospital code, UHID, mobile number and code are required.' });

  const found = await findPatient(hospitalCode, uhid, phone);
  if (!found || !(await verifyOtp('patient', found.hospital.id, found.patient.id, otp))) {
    return res.status(401).json({ message: 'Invalid or expired code.' });
  }
  const { hospital, patient } = found;
  const token = signKindToken(
    { kind: 'patient', patientId: patient.id, hospitalId: hospital.id, hospitalCode: hospital.code, name: patient.full_name },
    '2h'
  );
  await writeAudit({ hospitalId: hospital.id, userId: null, userName: patient.full_name, role: 'Patient Portal', action: 'Login', module: 'Patient Portal', details: `${patient.uhid} signed in.`, ip: req.ip });
  res.json({
    token, tokenType: 'Bearer',
    patient: { id: patient.id, uhid: patient.uhid, name: patient.full_name },
    hospital: { id: hospital.id, code: hospital.code, name: hospital.name, logoUrl: hospital.logo_url },
  });
});

// ---- Authenticated ----

// GET /api/patient-portal/overview
router.get('/overview', requirePatient, async (req, res) => {
  const { patientId, hospitalId } = req.principal;

  const patient = await pool.query(
    `SELECT id, uhid, full_name, gender, age, blood_group, phone, email, address, registered_on
     FROM patients WHERE id = $1 AND hospital_id = $2`,
    [patientId, hospitalId]
  );
  if (!patient.rows[0]) return res.status(401).json({ message: 'Patient record no longer exists.' });

  const bookings = await pool.query(
    `SELECT id, booking_number, booking_date, booking_type, status, total_amount, paid_amount, payment_status
     FROM bookings WHERE hospital_id = $1 AND patient_id = $2 ORDER BY booking_date DESC`,
    [hospitalId, patientId]
  );
  const reports = await pool.query(
    `SELECT tr.id, tr.report_number, tr.status, tr.has_critical_result, b.booking_number
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id
     WHERE b.hospital_id = $1 AND b.patient_id = $2 ORDER BY tr.created_on DESC`,
    [hospitalId, patientId]
  );
  const invoices = await pool.query(
    `SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount
     FROM invoices i WHERE i.hospital_id = $1 AND i.patient_id = $2 ORDER BY i.invoice_date DESC`,
    [hospitalId, patientId]
  );

  res.json({
    patient: patient.rows[0],
    bookings: bookings.rows,
    reports: reports.rows.map((r) => ({ ...r, available: RELEASED.includes(r.status) })),
    invoices: invoices.rows.map((row) => ({ ...row, ...computeInvoiceTotals(row, row.paid_amount) })),
  });
});

// GET /api/patient-portal/reports/:id - own report, once it has left internal review
router.get('/reports/:id', requirePatient, async (req, res) => {
  const { patientId, hospitalId } = req.principal;
  const r = await pool.query(
    `SELECT tr.*, b.booking_number, b.booking_date, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id JOIN patients p ON p.id = b.patient_id
     WHERE tr.id = $1 AND b.hospital_id = $2 AND b.patient_id = $3`,
    [req.params.id, hospitalId, patientId]
  );
  const report = r.rows[0];
  if (!report) return res.status(404).json({ message: 'Report not found.' });
  if (!RELEASED.includes(report.status)) {
    return res.status(409).json({ message: "This report is still being processed and isn't available yet." });
  }
  const results = await pool.query(`SELECT * FROM report_results WHERE report_id = $1 ORDER BY display_order ASC, id ASC`, [report.id]);
  res.json({ report, results: results.rows });
});

// GET /api/patient-portal/invoices/:id
router.get('/invoices/:id', requirePatient, async (req, res) => {
  const { patientId, hospitalId } = req.principal;
  const inv = await pool.query(
    `SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount
     FROM invoices i WHERE i.id = $1 AND i.hospital_id = $2 AND i.patient_id = $3`,
    [req.params.id, hospitalId, patientId]
  );
  if (!inv.rows[0]) return res.status(404).json({ message: 'Invoice not found.' });
  const items = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1`, [req.params.id]);
  const payments = await pool.query(`SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at ASC`, [req.params.id]);
  res.json({ invoice: { ...inv.rows[0], ...computeInvoiceTotals(inv.rows[0], inv.rows[0].paid_amount) }, items: items.rows, payments: payments.rows });
});

module.exports = router;
