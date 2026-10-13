const express = require('express');
const pool = require('../db/pool');
const { requireKind, signKindToken } = require('../middleware/kindAuth');
const { issueOtp, verifyOtp, exposeOtp, OTP_TTL_MINUTES } = require('../utils/portalOtp');
const { generateRequestNumber } = require('../utils/bloodBankNumbers');
const { writeAudit } = require('../utils/audit');

// Doctor Portal: a read-mostly workspace for referring doctors (their referred patients,
// bookings and released reports) plus raising blood requests. Mirrors DoctorPortalController.
// Sign-in is hospital code + registered mobile + one-time code (the original used the mobile only).
const router = express.Router();
const requireDoctor = requireKind('doctor');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENT_TYPES = ['Whole Blood', 'Packed RBC', 'Platelets', 'Plasma', 'Cryoprecipitate'];
const REQUEST_PRIORITIES = ['Normal', 'Urgent', 'Emergency', 'Critical'];
const RELEASED = ['Verified', 'Approved', 'Delivered']; // earlier stages stay internal
const GENERIC = 'If these details match a doctor record, a one-time code has been sent.';

// Resolves the active doctor for a hospital code + mobile. Returns { hospital, doctor } or null.
async function findDoctor(hospitalCode, phone) {
  const h = await pool.query(`SELECT * FROM hospitals WHERE UPPER(code) = UPPER($1)`, [String(hospitalCode || '').trim()]);
  const hospital = h.rows[0];
  if (!hospital || hospital.status === 'Suspended') return null;
  const d = await pool.query(
    `SELECT * FROM doctors WHERE hospital_id = $1 AND phone = $2 AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
    [hospital.id, String(phone || '').trim()]
  );
  return d.rows[0] ? { hospital, doctor: d.rows[0] } : null;
}

// POST /api/doctor-portal/request-otp { hospitalCode, phone }
router.post('/request-otp', async (req, res) => {
  const { hospitalCode, phone } = req.body;
  if (!hospitalCode || !phone) return res.status(400).json({ message: 'Hospital code and mobile number are required.' });

  const found = await findDoctor(hospitalCode, phone);
  const body = { message: GENERIC, expiresInMinutes: OTP_TTL_MINUTES };
  if (found) {
    const issued = await issueOtp('doctor', found.hospital.id, found.doctor.id);
    if (issued.cooldown) return res.status(429).json({ message: 'A code was just sent. Please wait a few seconds before requesting another.' });
    if (exposeOtp()) body.devOtp = issued.otp;
  }
  res.json(body);
});

// POST /api/doctor-portal/login { hospitalCode, phone, otp }
router.post('/login', async (req, res) => {
  const { hospitalCode, phone, otp } = req.body;
  if (!hospitalCode || !phone || !otp) return res.status(400).json({ message: 'Hospital code, mobile number and code are required.' });

  const found = await findDoctor(hospitalCode, phone);
  if (!found || !(await verifyOtp('doctor', found.hospital.id, found.doctor.id, otp))) {
    return res.status(401).json({ message: 'Invalid or expired code.' });
  }
  const { hospital, doctor } = found;
  const profile = { id: doctor.id, name: doctor.full_name, specialization: doctor.specialization };
  const token = signKindToken(
    { kind: 'doctor', doctorId: doctor.id, hospitalId: hospital.id, hospitalCode: hospital.code, name: doctor.full_name },
    '4h'
  );
  await writeAudit({ hospitalId: hospital.id, userId: null, userName: doctor.full_name, role: 'Doctor Portal', action: 'Login', module: 'Doctor Portal', details: `${doctor.full_name} signed in.`, ip: req.ip });
  res.json({ token, tokenType: 'Bearer', doctor: profile, hospital: { id: hospital.id, code: hospital.code, name: hospital.name, logoUrl: hospital.logo_url } });
});

// ---- Authenticated ----

// GET /api/doctor-portal/overview - referred patients, bookings and reports attributed to this doctor
router.get('/overview', requireDoctor, async (req, res) => {
  const { doctorId, hospitalId } = req.principal;

  const doctor = await pool.query(
    `SELECT id, full_name, specialization, qualification, registration_number, hospital_name, phone FROM doctors WHERE id = $1 AND hospital_id = $2`,
    [doctorId, hospitalId]
  );
  if (!doctor.rows[0]) return res.status(401).json({ message: 'Doctor account no longer exists.' });

  const patients = await pool.query(
    `SELECT id, uhid, full_name, gender, age, phone, registered_on FROM patients
     WHERE hospital_id = $1 AND referral_type = 'Doctor' AND referred_by_doctor_id = $2 ORDER BY registered_on DESC`,
    [hospitalId, doctorId]
  );
  const bookings = await pool.query(
    `SELECT b.id, b.booking_number, b.booking_date, b.status, b.total_amount, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM bookings b JOIN patients p ON p.id = b.patient_id
     WHERE b.hospital_id = $1 AND b.doctor_id = $2 ORDER BY b.booking_date DESC`,
    [hospitalId, doctorId]
  );
  const reports = await pool.query(
    `SELECT tr.id, tr.report_number, tr.status, tr.has_critical_result, b.booking_number, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id JOIN patients p ON p.id = b.patient_id
     WHERE b.hospital_id = $1 AND b.doctor_id = $2 ORDER BY tr.created_on DESC`,
    [hospitalId, doctorId]
  );
  res.json({
    doctor: doctor.rows[0],
    patients: patients.rows,
    bookings: bookings.rows,
    reports: reports.rows.map((r) => ({ ...r, available: RELEASED.includes(r.status) })),
  });
});

// GET /api/doctor-portal/reports/:id - only reports for this doctor's bookings, and only once released
router.get('/reports/:id', requireDoctor, async (req, res) => {
  const { doctorId, hospitalId } = req.principal;
  const r = await pool.query(
    `SELECT tr.*, b.booking_number, b.booking_date, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age
     FROM test_reports tr JOIN bookings b ON b.id = tr.booking_id JOIN patients p ON p.id = b.patient_id
     WHERE tr.id = $1 AND b.hospital_id = $2 AND b.doctor_id = $3`,
    [req.params.id, hospitalId, doctorId]
  );
  const report = r.rows[0];
  if (!report) return res.status(404).json({ message: 'Report not found.' });
  if (!RELEASED.includes(report.status)) {
    return res.status(409).json({ message: "This report is still being processed and isn't available yet." });
  }
  const results = await pool.query(`SELECT * FROM report_results WHERE report_id = $1 ORDER BY display_order ASC, id ASC`, [report.id]);
  res.json({ report, results: results.rows });
});

// GET /api/doctor-portal/blood-requests - this doctor's own requests + read-only available stock per group
router.get('/blood-requests', requireDoctor, async (req, res) => {
  const { doctorId, hospitalId } = req.principal;
  const requests = await pool.query(
    `SELECT br.*, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM blood_requests br JOIN patients p ON p.id = br.patient_id
     WHERE br.hospital_id = $1 AND br.requested_by_doctor_id = $2 ORDER BY br.requested_on DESC`,
    [hospitalId, doctorId]
  );
  const stock = await pool.query(
    `SELECT blood_group, COUNT(*)::int AS available FROM blood_units
     WHERE hospital_id = $1 AND status = 'Available' AND expiry_date >= CURRENT_DATE GROUP BY blood_group`,
    [hospitalId]
  );
  const stockMap = Object.fromEntries(stock.rows.map((s) => [s.blood_group, s.available]));
  res.json({
    requests: requests.rows,
    stock: BLOOD_GROUPS.map((g) => ({ bloodGroup: g, available: stockMap[g] || 0 })),
    options: { bloodGroups: BLOOD_GROUPS, componentTypes: COMPONENT_TYPES, priorities: REQUEST_PRIORITIES },
  });
});

// POST /api/doctor-portal/blood-requests { patientId, bloodGroup, componentType, unitsRequested, priority, reasonForRequest }
// Always attributed to the signed-in doctor, and only for patients that doctor referred.
router.post('/blood-requests', requireDoctor, async (req, res) => {
  const { doctorId, hospitalId, name } = req.principal;
  const b = req.body;
  const units = Number(b.unitsRequested);
  const priority = b.priority || 'Normal';
  const componentType = b.componentType || 'Whole Blood';

  const errors = {};
  if (!b.patientId) errors.patientId = 'Select a patient.';
  if (!BLOOD_GROUPS.includes(b.bloodGroup)) errors.bloodGroup = 'Select a valid blood group.';
  if (!COMPONENT_TYPES.includes(componentType)) errors.componentType = 'Invalid component type.';
  if (!REQUEST_PRIORITIES.includes(priority)) errors.priority = 'Invalid priority.';
  if (!Number.isInteger(units) || units < 1 || units > 20) errors.unitsRequested = 'Enter 1 to 20 units.';
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });

  const own = await pool.query(
    `SELECT id FROM patients WHERE id = $1 AND hospital_id = $2 AND referral_type = 'Doctor' AND referred_by_doctor_id = $3`,
    [b.patientId, hospitalId, doctorId]
  );
  if (!own.rows[0]) return res.status(400).json({ message: 'Validation failed.', errors: { patientId: 'Select one of your referred patients.' } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestNumber = await generateRequestNumber(client);
    const result = await client.query(
      `INSERT INTO blood_requests (hospital_id, request_number, patient_id, blood_group, component_type, units_requested,
         priority, requested_by_doctor_id, reason_for_request, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [hospitalId, requestNumber, b.patientId, b.bloodGroup, componentType, units, priority, doctorId, b.reasonForRequest || null, name]
    );
    await client.query('COMMIT');
    await writeAudit({
      hospitalId, userId: null, userName: name, role: 'Doctor Portal', action: 'Raise Blood Request', module: 'Blood Bank',
      details: `${requestNumber} (${priority})`, severity: ['Emergency', 'Critical'].includes(priority) ? 'Critical' : 'Info', ip: req.ip,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
