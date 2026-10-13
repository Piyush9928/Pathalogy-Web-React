const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { generateUhid } = require('../utils/uhid');
const { isPositiveInt, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''];
const REFERRAL_TYPES = ['Self', 'Doctor', 'Collection Center'];
const FAMILY_RELATIONS = ['Self', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other'];
const MAX_PHOTO_CHARS = 150000; // base64 data URL; keeps one row from carrying megabytes

function mapPatientBody(body) {
  return {
    fullName: (body.fullName || '').trim(),
    gender: body.gender || 'Male',
    age: body.age === '' || body.age === undefined ? null : Number(body.age),
    bloodGroup: body.bloodGroup || null,
    phone: (body.phone || '').trim(),
    email: body.email ? body.email.trim() : null,
    address: body.address ? body.address.trim() : null,
    referralType: body.referralType || 'Self',
    referredByDoctorId: body.referredByDoctorId || null,
    referredByBranchId: body.referredByBranchId || null,
    title: body.title || null,
    maritalStatus: body.maritalStatus || null,
    religion: body.religion || null,
    dateOfBirth: body.dateOfBirth || null,
    guardianName: body.guardianName || null,
    motherName: body.motherName || null,
    occupation: body.occupation || null,
    emergencyContact: body.emergencyContact || null,
    diseaseIdentification: body.diseaseIdentification || null,
    diseaseDetails: body.diseaseDetails || null,
    allergies: body.allergies || null,
    aadhaarUid: body.aadhaarUid || null,
    idProof: body.idProof || null,
    cardNo: body.cardNo || null,
    photoUrl: body.photoUrl || null,
    primaryFamilyUhid: body.primaryFamilyUhid || null,
    familyRelation: body.familyRelation || 'Self',
  };
}

// Column widths from migration 003. Anything longer would fail the INSERT with an unhelpful 500.
const MAX_LENGTHS = {
  fullName: 150, phone: 30, email: 150, address: 300, title: 10, maritalStatus: 20, religion: 50, guardianName: 150,
  motherName: 150, occupation: 100, emergencyContact: 30, diseaseIdentification: 300, diseaseDetails: 1000, allergies: 500,
  aadhaarUid: 20, idProof: 50, cardNo: 50, primaryFamilyUhid: 40,
};

function validatePatient(p) {
  const errors = {};
  if (!p.fullName) errors.fullName = 'Full name is required.';
  if (!p.phone) errors.phone = 'Phone is required.';
  else if (!/^[0-9+\-\s()]{6,30}$/.test(p.phone)) errors.phone = 'Enter a valid phone number.';
  if (!GENDERS.includes(p.gender)) errors.gender = 'Invalid gender.';
  // Number.isInteger rejects NaN and decimals; the old range check let NaN through and crashed the INSERT.
  if (p.age !== null && !(Number.isInteger(p.age) && p.age >= 0 && p.age <= 120)) errors.age = 'Age must be a whole number between 0 and 120.';
  if (p.bloodGroup && !BLOOD_GROUPS.includes(p.bloodGroup)) errors.bloodGroup = 'Invalid blood group.';
  if (!REFERRAL_TYPES.includes(p.referralType)) errors.referralType = 'Invalid referral type.';
  if (p.referralType === 'Doctor' && !p.referredByDoctorId) errors.referredByDoctorId = 'Select the referring doctor.';
  if (p.referralType === 'Collection Center' && !p.referredByBranchId) errors.referredByBranchId = 'Select the collection center.';
  if (p.familyRelation && !FAMILY_RELATIONS.includes(p.familyRelation)) errors.familyRelation = 'Invalid family relation.';
  if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) errors.email = 'Enter a valid email.';
  if (p.dateOfBirth && (!isDateString(String(p.dateOfBirth)) || new Date(p.dateOfBirth) > new Date())) errors.dateOfBirth = 'Date of birth must be a valid past date.';
  if (p.photoUrl && String(p.photoUrl).length > MAX_PHOTO_CHARS) errors.photoUrl = 'The photo is too large.';
  for (const [key, max] of Object.entries(MAX_LENGTHS)) {
    if (p[key] && String(p[key]).length > max && !errors[key]) errors[key] = `Must be ${max} characters or fewer.`;
  }
  return errors;
}

// Referring doctor / collection centre / family head must be this hospital's own. Returns an errors object.
async function validatePatientReferences(p, hospitalId) {
  const errors = {};
  if (p.referredByDoctorId && !(await idsBelongToHospital(pool, 'doctors', hospitalId, [p.referredByDoctorId]))) errors.referredByDoctorId = 'Referring doctor not found.';
  if (p.referredByBranchId && !(await idsBelongToHospital(pool, 'branches', hospitalId, [p.referredByBranchId]))) errors.referredByBranchId = 'Collection center not found.';
  if (p.primaryFamilyUhid) {
    const head = await pool.query(`SELECT 1 FROM patients WHERE hospital_id = $1 AND UPPER(uhid) = UPPER($2)`, [hospitalId, p.primaryFamilyUhid]);
    if (!head.rows[0]) errors.primaryFamilyUhid = 'No patient with that UHID.';
  }
  return errors;
}

// GET /api/patients?search=&page=&pageSize=
router.get('/', requirePermission('patients.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', page = 1, pageSize = 20 } = req.query;
  const limit = Math.min(Number(pageSize) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const result = await pool.query(
    `SELECT p.*, d.full_name AS referred_doctor_name, b.name AS referred_branch_name
     FROM patients p
     LEFT JOIN doctors d ON d.id = p.referred_by_doctor_id
     LEFT JOIN branches b ON b.id = p.referred_by_branch_id
     WHERE p.hospital_id = $1 AND (p.full_name ILIKE $2 OR p.uhid ILIKE $2 OR p.phone ILIKE $2)
     ORDER BY p.registered_on DESC
     LIMIT $3 OFFSET $4`,
    [hospitalId, `%${search}%`, limit, offset]
  );

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM patients WHERE hospital_id = $1 AND (full_name ILIKE $2 OR uhid ILIKE $2 OR phone ILIKE $2)`,
    [hospitalId, `%${search}%`]
  );

  res.json({
    patients: result.rows,
    pagination: { page: Number(page), pageSize: limit, total: Number(countRes.rows[0].count) },
  });
});

// GET /api/patients/autocomplete?q=
router.get('/autocomplete', requirePermission('patients.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { q = '' } = req.query;
  const result = await pool.query(
    `SELECT id, uhid, full_name, phone, gender, age FROM patients
     WHERE hospital_id = $1 AND is_active = TRUE AND (full_name ILIKE $2 OR uhid ILIKE $2 OR phone ILIKE $2)
     ORDER BY full_name ASC LIMIT 15`,
    [hospitalId, `%${q}%`]
  );
  res.json({ patients: result.rows });
});

// GET /api/patients/:id
router.get('/:id', requirePermission('patients.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Patient not found.' });

  const result = await pool.query(
    `SELECT p.*, d.full_name AS referred_doctor_name, b.name AS referred_branch_name
     FROM patients p
     LEFT JOIN doctors d ON d.id = p.referred_by_doctor_id
     LEFT JOIN branches b ON b.id = p.referred_by_branch_id
     WHERE p.id = $1 AND p.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Patient not found.' });
  res.json(result.rows[0]);
});

// POST /api/patients
router.post('/', requirePermission('patients.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const p = mapPatientBody(req.body);
  const errors = { ...validatePatient(p) };
  if (Object.keys(errors).length === 0) Object.assign(errors, await validatePatientReferences(p, hospitalId));
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const uhid = await generateUhid(client, hospitalId);

    const result = await client.query(
      `INSERT INTO patients (
         hospital_id, uhid, full_name, gender, age, blood_group, phone, email, address,
         referral_type, referred_by_doctor_id, referred_by_branch_id,
         title, marital_status, religion, date_of_birth, guardian_name, mother_name, occupation,
         emergency_contact, disease_identification, disease_details, allergies, aadhaar_uid, id_proof,
         card_no, photo_url, primary_family_uhid, family_relation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       RETURNING *`,
      [
        hospitalId, uhid, p.fullName, p.gender, p.age, p.bloodGroup, p.phone, p.email, p.address,
        p.referralType, p.referredByDoctorId, p.referredByBranchId,
        p.title, p.maritalStatus, p.religion, p.dateOfBirth, p.guardianName, p.motherName, p.occupation,
        p.emergencyContact, p.diseaseIdentification, p.diseaseDetails, p.allergies, p.aadhaarUid, p.idProof,
        p.cardNo, p.photoUrl, p.primaryFamilyUhid, p.familyRelation,
      ]
    );

    if (p.referralType === 'Doctor' && p.referredByDoctorId) {
      await client.query(`UPDATE doctors SET total_referrals = total_referrals + 1 WHERE id = $1 AND hospital_id = $2`, [p.referredByDoctorId, hospitalId]);
    }

    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Register Patient', module: 'Patients', details: `Registered ${p.fullName} (${uhid})`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/patients/:id  (UHID and registeredOn are never changed, mirrors original UpdatePatient)
router.put('/:id', requirePermission('patients.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Patient not found.' });
  const p = mapPatientBody(req.body);
  const errors = { ...validatePatient(p) };
  if (Object.keys(errors).length === 0) Object.assign(errors, await validatePatientReferences(p, hospitalId));
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed.', errors });

  const result = await pool.query(
    `UPDATE patients SET
       full_name=$1, gender=$2, age=$3, blood_group=$4, phone=$5, email=$6, address=$7,
       referral_type=$8, referred_by_doctor_id=$9, referred_by_branch_id=$10,
       title=$11, marital_status=$12, religion=$13, date_of_birth=$14, guardian_name=$15, mother_name=$16, occupation=$17,
       emergency_contact=$18, disease_identification=$19, disease_details=$20, allergies=$21, aadhaar_uid=$22, id_proof=$23,
       card_no=$24, photo_url=$25, primary_family_uhid=$26, family_relation=$27
     WHERE id = $28 AND hospital_id = $29 RETURNING *`,
    [
      p.fullName, p.gender, p.age, p.bloodGroup, p.phone, p.email, p.address,
      p.referralType, p.referredByDoctorId, p.referredByBranchId,
      p.title, p.maritalStatus, p.religion, p.dateOfBirth, p.guardianName, p.motherName, p.occupation,
      p.emergencyContact, p.diseaseIdentification, p.diseaseDetails, p.allergies, p.aadhaarUid, p.idProof,
      p.cardNo, p.photoUrl, p.primaryFamilyUhid, p.familyRelation, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Patient not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit Patient', module: 'Patients', details: `Edited ${p.fullName} (${result.rows[0].uhid})`, ip: req.ip });
  res.json(result.rows[0]);
});

// PATCH /api/patients/:id/active { isActive } - deactivate/reactivate (improvement: original had no toggle, only hard delete)
router.patch('/:id/active', requirePermission('patients.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Patient not found.' });

  const result = await pool.query(
    `UPDATE patients SET is_active = $1 WHERE id = $2 AND hospital_id = $3 RETURNING id, full_name, uhid, is_active`,
    [isActive, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Patient not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: isActive ? 'Activate Patient' : 'Deactivate Patient', module: 'Patients', details: `${result.rows[0].full_name} (${result.rows[0].uhid})`, ip: req.ip });
  res.json(result.rows[0]);
});

// DELETE /api/patients/:id
router.delete('/:id', requirePermission('patients.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Patient not found.' });

  let result;
  try {
    result = await pool.query(`DELETE FROM patients WHERE id = $1 AND hospital_id = $2 RETURNING full_name, uhid`, [id, hospitalId]);
  } catch (err) {
    // A patient with bookings, invoices, admissions etc. is part of the medical and financial record.
    if (err.code === '23503') return res.status(409).json({ message: 'This patient has bookings, invoices or other records and cannot be deleted. Deactivate the patient instead.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Patient not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete Patient', module: 'Patients', details: `${result.rows[0].full_name} (${result.rows[0].uhid})`, severity: 'Critical', ip: req.ip });
  res.json({ message: 'Patient deleted.' });
});

module.exports = router;
