const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isInt, isPositiveInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['Permanent', 'Visiting'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Returns a message when the mapped doctor is invalid, otherwise null.
async function validateDoctor(d, hospitalId, { excludeId = null } = {}) {
  if (!String(d.fullName || '').trim() || !String(d.specialization || '').trim() || !String(d.phone || '').trim()) {
    return 'Full name, specialization, and phone are required.';
  }
  for (const [label, v, max] of [['Full name', d.fullName, 150], ['Specialization', d.specialization, 150], ['Qualification', d.qualification, 150],
    ['Registration number', d.registrationNumber, 80], ['Hospital name', d.hospitalName, 150], ['Phone', d.phone, 30], ['Address', d.doctorAddress, 300]]) {
    if (v && String(v).length > max) return `${label} must be ${max} characters or fewer.`;
  }
  if (!/^[0-9+\-\s()]{6,30}$/.test(String(d.phone).trim())) return 'Enter a valid phone number.';
  if (!CATEGORIES.includes(d.category)) return 'Invalid category.';
  // Commission is a percentage of revenue: negative or over-100% values corrupt every referral payout figure.
  if (!(Number.isFinite(Number(d.commissionPercent)) && Number(d.commissionPercent) >= 0 && Number(d.commissionPercent) <= 100)) return 'Commission must be between 0 and 100 percent.';
  if (!isMoney(d.consultationFee)) return 'Consultation fee must be 0 or more.';
  if (!(isInt(d.daysOfConsultation) && Number(d.daysOfConsultation) >= 0 && Number(d.daysOfConsultation) <= 127)) return 'Invalid consultation days.';
  if (!(isInt(d.displayOrder) && Number(d.displayOrder) >= 0 && Number(d.displayOrder) <= 100000)) return 'Display order must be a whole number, 0 or more.';
  if (!(isPositiveInt(d.visitTimePerPatientMinutes) && Number(d.visitTimePerPatientMinutes) <= 600)) return 'Visit time must be a whole number of minutes (1-600).';
  if (d.consultationPeriodMinutes && !(isPositiveInt(d.consultationPeriodMinutes) && Number(d.consultationPeriodMinutes) <= 1440)) return 'Consultation period must be a whole number of minutes.';
  if ((d.meetingFrom && !TIME_RE.test(d.meetingFrom)) || (d.meetingTo && !TIME_RE.test(d.meetingTo))) return 'Meeting times must look like 09:30.';
  if (typeof d.isOnlineAvailable !== 'boolean') return 'isOnlineAvailable must be true or false.';
  if (d.departmentId && !(await idsBelongToHospital(pool, 'departments', hospitalId, [d.departmentId]))) return 'Department not found.';

  // The doctor portal signs a doctor in by mobile number, so two active doctors must not share one.
  const dup = await pool.query(
    `SELECT full_name FROM doctors WHERE hospital_id = $1 AND phone = $2 AND is_active = TRUE AND ($3::int IS NULL OR id <> $3) LIMIT 1`,
    [hospitalId, String(d.phone).trim(), excludeId]
  );
  if (dup.rows[0]) return `The phone number is already used by ${dup.rows[0].full_name}.`;
  return null;
}

function mapDoctorBody(body) {
  return {
    fullName: body.fullName,
    specialization: body.specialization,
    qualification: body.qualification || null,
    registrationNumber: body.registrationNumber || null,
    hospitalName: body.hospitalName || null,
    phone: body.phone,
    commissionPercent: body.commissionPercent ?? 0,
    departmentId: body.departmentId || null,
    doctorGender: body.doctorGender || null,
    doctorAddress: body.doctorAddress || null,
    category: body.category || 'Permanent',
    consultationFee: body.consultationFee ?? 0,
    meetingFrom: body.meetingFrom || null,
    meetingTo: body.meetingTo || null,
    daysOfConsultation: body.daysOfConsultation ?? 127,
    consultationPeriodMinutes: body.consultationPeriodMinutes || null,
    displayOrder: body.displayOrder ?? 0,
    doctorType: body.doctorType || null,
    visitTimePerPatientMinutes: body.visitTimePerPatientMinutes ?? 10,
    isOnlineAvailable: body.isOnlineAvailable ?? true,
  };
}

// GET /api/doctors?search=&status=
router.get('/', requirePermission('doctors.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status } = req.query;

  const conditions = ['hospital_id = $1', '(full_name ILIKE $2 OR specialization ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (status === 'active') conditions.push('is_active = TRUE');
  if (status === 'inactive') conditions.push('is_active = FALSE');

  const result = await pool.query(
    `SELECT * FROM doctors WHERE ${conditions.join(' AND ')} ORDER BY display_order ASC, full_name ASC`,
    params
  );
  res.json({ doctors: result.rows });
});

// GET /api/doctors/autocomplete?q= - lightweight typeahead for later phases (booking, patient referral picker)
router.get('/autocomplete', requirePermission('doctors.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { q = '' } = req.query;
  const result = await pool.query(
    `SELECT id, full_name, specialization, phone FROM doctors
     WHERE hospital_id = $1 AND is_active = TRUE AND (full_name ILIKE $2 OR specialization ILIKE $2)
     ORDER BY full_name ASC LIMIT 15`,
    [hospitalId, `%${q}%`]
  );
  res.json({ doctors: result.rows });
});

// GET /api/doctors/:id
router.get('/:id', requirePermission('doctors.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const doctorRes = await pool.query(`SELECT * FROM doctors WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  const doctor = doctorRes.rows[0];
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });

  const referredPatients = await pool.query(
    `SELECT id, uhid, full_name, phone, registered_on FROM patients
     WHERE hospital_id = $1 AND referral_type = 'Doctor' AND referred_by_doctor_id = $2
     ORDER BY registered_on DESC LIMIT 50`,
    [hospitalId, id]
  );

  res.json({ doctor, referredPatients: referredPatients.rows });
});

// POST /api/doctors
router.post('/', requirePermission('doctors.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const d = mapDoctorBody(req.body);
  const invalid = await validateDoctor(d, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  const result = await pool.query(
    `INSERT INTO doctors (
       hospital_id, full_name, specialization, qualification, registration_number, hospital_name, phone,
       commission_percent, department_id, doctor_gender, doctor_address, category, consultation_fee,
       meeting_from, meeting_to, days_of_consultation, consultation_period_minutes, display_order,
       doctor_type, visit_time_per_patient_minutes, is_online_available
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      hospitalId, d.fullName, d.specialization, d.qualification, d.registrationNumber, d.hospitalName, d.phone,
      d.commissionPercent, d.departmentId, d.doctorGender, d.doctorAddress, d.category, d.consultationFee,
      d.meetingFrom, d.meetingTo, d.daysOfConsultation, d.consultationPeriodMinutes, d.displayOrder,
      d.doctorType, d.visitTimePerPatientMinutes, d.isOnlineAvailable,
    ]
  );

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Doctor', module: 'Doctors', details: `Created doctor ${d.fullName}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

// PUT /api/doctors/:id
router.put('/:id', requirePermission('doctors.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Doctor not found.' });
  const d = mapDoctorBody(req.body);
  const invalid = await validateDoctor(d, hospitalId, { excludeId: Number(id) });
  if (invalid) return res.status(400).json({ message: invalid });

  const result = await pool.query(
    `UPDATE doctors SET
       full_name=$1, specialization=$2, qualification=$3, registration_number=$4, hospital_name=$5, phone=$6,
       commission_percent=$7, department_id=$8, doctor_gender=$9, doctor_address=$10, category=$11, consultation_fee=$12,
       meeting_from=$13, meeting_to=$14, days_of_consultation=$15, consultation_period_minutes=$16, display_order=$17,
       doctor_type=$18, visit_time_per_patient_minutes=$19, is_online_available=$20
     WHERE id = $21 AND hospital_id = $22 RETURNING *`,
    [
      d.fullName, d.specialization, d.qualification, d.registrationNumber, d.hospitalName, d.phone,
      d.commissionPercent, d.departmentId, d.doctorGender, d.doctorAddress, d.category, d.consultationFee,
      d.meetingFrom, d.meetingTo, d.daysOfConsultation, d.consultationPeriodMinutes, d.displayOrder,
      d.doctorType, d.visitTimePerPatientMinutes, d.isOnlineAvailable, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Doctor not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit Doctor', module: 'Doctors', details: `Edited doctor ${d.fullName}`, ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/doctors/:id/active { isActive }
router.patch('/:id/active', requirePermission('doctors.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Doctor not found.' });

  // Reactivating must not recreate a duplicate-phone clash with another active doctor.
  if (isActive) {
    const clash = await pool.query(
      `SELECT o.full_name FROM doctors d JOIN doctors o ON o.hospital_id = d.hospital_id AND o.phone = d.phone AND o.is_active = TRUE AND o.id <> d.id
       WHERE d.id = $1 AND d.hospital_id = $2 LIMIT 1`,
      [id, hospitalId]
    );
    if (clash.rows[0]) return res.status(409).json({ message: `Another active doctor (${clash.rows[0].full_name}) already uses this phone number.` });
  }

  const result = await pool.query(
    `UPDATE doctors SET is_active = $1 WHERE id = $2 AND hospital_id = $3 RETURNING id, full_name, is_active`,
    [isActive, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Doctor not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: isActive ? 'Activate Doctor' : 'Deactivate Doctor', module: 'Doctors', details: result.rows[0].full_name, ip: req.ip });
  res.json(result.rows[0]);
});

// DELETE /api/doctors/:id
router.delete('/:id', requirePermission('doctors.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Doctor not found.' });
  let result;
  try {
    result = await pool.query(`DELETE FROM doctors WHERE id = $1 AND hospital_id = $2 RETURNING full_name`, [id, hospitalId]);
  } catch (err) {
    // Referred patients, bookings, visits and admissions point at this doctor; keep that history.
    if (err.code === '23503') return res.status(409).json({ message: 'This doctor has patients, bookings or visits on record and cannot be deleted. Deactivate the doctor instead.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Doctor not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete Doctor', module: 'Doctors', details: result.rows[0].full_name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Doctor deleted.' });
});

module.exports = router;
