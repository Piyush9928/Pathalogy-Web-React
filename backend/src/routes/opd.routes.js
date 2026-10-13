const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isPositiveInt, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const SHIFTS = ['Morning', 'Evening'];
const HEADS = ['General OPD', 'Gynec OPD', 'Pediatric OPD', 'Ortho OPD'];
const STATUSES = ['Waiting', 'Calling', 'In Consultation', 'Completed', 'Skipped', 'Cancelled'];

async function generateVisitNumber(client) {
  const seqRes = await client.query(`SELECT nextval('opd_visit_number_seq') AS seq`);
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `OPD-${datePart}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

// Optional numeric vital: absent/empty is fine, otherwise it must be a number inside a plausible range.
function inRange(v, min, max) {
  if (v === undefined || v === null || v === '') return true;
  return Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
}

// GET /api/opd/visits?date=&doctorId=&status=
router.get('/visits', requirePermission('opd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { date, doctorId = '', status = '' } = req.query;
  if (date && !isDateString(date)) return res.status(400).json({ message: 'Date is not valid.' });
  if (doctorId && !isPositiveInt(doctorId)) return res.status(400).json({ message: 'Invalid doctor filter.' });
  const tokenDate = date || new Date().toISOString().slice(0, 10);

  const conditions = ['ov.hospital_id = $1', 'ov.token_date = $2'];
  const params = [hospitalId, tokenDate];
  if (doctorId) { params.push(doctorId); conditions.push(`ov.doctor_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`ov.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT ov.*, p.full_name AS patient_name, p.uhid AS patient_uhid, d.full_name AS doctor_name
     FROM opd_visits ov
     JOIN patients p ON p.id = ov.patient_id
     JOIN doctors d ON d.id = ov.doctor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ov.priority_order DESC, ov.token_no ASC`,
    params
  );

  res.json({
    visits: result.rows,
    stats: {
      waiting: result.rows.filter((v) => v.status === 'Waiting').length,
      inConsultation: result.rows.filter((v) => v.status === 'In Consultation').length,
      completed: result.rows.filter((v) => v.status === 'Completed').length,
    },
    shifts: SHIFTS, heads: HEADS, statuses: STATUSES,
  });
});

router.get('/visits/:id', requirePermission('opd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'OPD visit not found.' });
  const result = await pool.query(
    `SELECT ov.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age, d.full_name AS doctor_name
     FROM opd_visits ov JOIN patients p ON p.id = ov.patient_id JOIN doctors d ON d.id = ov.doctor_id
     WHERE ov.id = $1 AND ov.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'OPD visit not found.' });
  res.json(result.rows[0]);
});

// POST /api/opd/visits { patientId, doctorId, opdShift, opdHead, panelId?, consultationFee }
router.post('/visits', requirePermission('opd.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.patientId || !b.doctorId) return res.status(400).json({ message: 'Patient and doctor are required.' });
  if (b.opdShift !== undefined && !SHIFTS.includes(b.opdShift)) return res.status(400).json({ message: 'Invalid OPD shift.' });
  if (b.opdHead !== undefined && !HEADS.includes(b.opdHead)) return res.status(400).json({ message: 'Invalid OPD head.' });
  if (b.consultationFee !== undefined && b.consultationFee !== '' && !isMoney(b.consultationFee)) return res.status(400).json({ message: 'Consultation fee must be 0 or more.' });
  if (b.priorityOrder !== undefined && !(Number.isInteger(Number(b.priorityOrder)) && Number(b.priorityOrder) >= 0 && Number(b.priorityOrder) <= 10)) {
    return res.status(400).json({ message: 'Priority must be a whole number from 0 to 10.' });
  }
  if (b.panelId && !isPositiveInt(b.panelId)) return res.status(400).json({ message: 'Invalid panel.' });
  // Patient and doctor ids are global serials: both must belong to this hospital.
  if (!isPositiveInt(b.patientId) || !(await idsBelongToHospital(pool, 'patients', hospitalId, [b.patientId]))) return res.status(404).json({ message: 'Patient not found.' });
  if (!isPositiveInt(b.doctorId) || !(await idsBelongToHospital(pool, 'doctors', hospitalId, [b.doctorId]))) return res.status(404).json({ message: 'Doctor not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenDate = new Date().toISOString().slice(0, 10);
    const opdShift = b.opdShift || 'Morning';
    const opdHead = b.opdHead || 'General OPD';

    // Tokens are MAX+1 per doctor/shift/head/day. Without a lock two simultaneous registrations both read the same
    // MAX and one fails on the unique constraint. This per-(hospital, doctor) lock hands tokens out one at a time.
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [hospitalId, Number(b.doctorId)]);
    const tokenRes = await client.query(
      `SELECT COALESCE(MAX(token_no), 0) + 1 AS next_token FROM opd_visits
       WHERE hospital_id = $1 AND doctor_id = $2 AND opd_shift = $3 AND opd_head = $4 AND token_date = $5`,
      [hospitalId, b.doctorId, opdShift, opdHead, tokenDate]
    );
    const tokenNo = tokenRes.rows[0].next_token;
    const visitNumber = await generateVisitNumber(client);

    const result = await client.query(
      `INSERT INTO opd_visits (hospital_id, visit_number, token_no, patient_id, doctor_id, opd_shift, opd_head, panel_id, token_date, consultation_fee, priority_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [hospitalId, visitNumber, tokenNo, b.patientId, b.doctorId, opdShift, opdHead, b.panelId || null, tokenDate, b.consultationFee || 0, b.priorityOrder || 1]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create OPD Visit', module: 'OPD', details: `${visitNumber} (Token ${tokenNo})`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') return res.status(400).json({ message: 'A selected panel was not found.' });
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/opd/visits/:id/status { status }
router.patch('/visits/:id/status', requirePermission('opd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'OPD visit not found.' });

  const timestampField = status === 'Calling' ? 'called_at' : status === 'Completed' ? 'completed_at' : null;
  const query = timestampField
    ? `UPDATE opd_visits SET status = $1, ${timestampField} = NOW() WHERE id = $2 AND hospital_id = $3 RETURNING *`
    : `UPDATE opd_visits SET status = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`;

  const result = await pool.query(query, [status, id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'OPD visit not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update OPD Visit Status', module: 'OPD', details: `${result.rows[0].visit_number} -> ${status}`, ip: req.ip });
  res.json(result.rows[0]);
});

// PUT /api/opd/visits/:id/consultation { bp, pulse, temperatureF, weightKg, heightCm, spo2, diagnosis, consultationNotes, remarks }
router.put('/visits/:id/consultation', requirePermission('opd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'OPD visit not found.' });

  // Plausible clinical ranges: they catch typos (a pulse of 720, a temperature of 986) before they reach the record.
  if (!inRange(b.pulse, 20, 300)) return res.status(400).json({ message: 'Pulse must be between 20 and 300.' });
  if (!inRange(b.temperatureF, 80, 115)) return res.status(400).json({ message: 'Temperature must be between 80 and 115 °F.' });
  if (!inRange(b.weightKg, 0.2, 700)) return res.status(400).json({ message: 'Weight must be between 0.2 and 700 kg.' });
  if (!inRange(b.heightCm, 20, 280)) return res.status(400).json({ message: 'Height must be between 20 and 280 cm.' });
  if (!inRange(b.spo2, 0, 100)) return res.status(400).json({ message: 'SpO2 must be between 0 and 100.' });
  if (b.bp && !/^\d{2,3}\/\d{2,3}$/.test(String(b.bp).trim())) return res.status(400).json({ message: 'Blood pressure must look like 120/80.' });
  for (const [label, v, max] of [['Diagnosis', b.diagnosis, 500], ['Consultation notes', b.consultationNotes, 4000], ['Remarks', b.remarks, 1000]]) {
    if (v && String(v).length > max) return res.status(400).json({ message: `${label} must be ${max} characters or fewer.` });
  }
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

  const result = await pool.query(
    `UPDATE opd_visits SET bp=$1, pulse=$2, temperature_f=$3, weight_kg=$4, height_cm=$5, spo2=$6, diagnosis=$7, consultation_notes=$8, remarks=$9
     WHERE id=$10 AND hospital_id=$11 RETURNING *`,
    [b.bp ? String(b.bp).trim() : null, num(b.pulse), num(b.temperatureF), num(b.weightKg), num(b.heightCm), num(b.spo2), b.diagnosis, b.consultationNotes, b.remarks, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'OPD visit not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Record OPD Consultation', module: 'OPD', details: result.rows[0].visit_number, ip: req.ip });
  res.json(result.rows[0]);
});

module.exports = router;
