const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

const DISCHARGE_TYPES = ['Normal', 'DAMA', 'LAMA', 'Death', 'Transfer'];
const CHARGE_CATEGORIES = ['Room Rent', 'Doctor Visit', 'Nursing', 'Medicine', 'Procedure', 'Investigation', 'Other'];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque'];
const TRANSFER_REASONS = ['Condition Improvement', 'Patient Request', 'Doctor Order', 'Infection Control'];

async function generateAdmissionNumber(client) {
  const seqRes = await client.query(`SELECT nextval('ipd_admission_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `IPD-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function hydrateAdmission(client, admission) {
  const chargesRes = await client.query(`SELECT * FROM ipd_charge_lines WHERE admission_id = $1 ORDER BY charge_date ASC`, [admission.id]);
  const paymentsRes = await client.query(`SELECT * FROM ipd_payments WHERE admission_id = $1 ORDER BY payment_date ASC`, [admission.id]);
  const doctorVisitsRes = await client.query(
    `SELECT dv.*, d.full_name AS doctor_name FROM ipd_doctor_visits dv LEFT JOIN doctors d ON d.id = dv.doctor_id WHERE admission_id = $1 ORDER BY visit_date ASC`,
    [admission.id]
  );
  const treatmentNotesRes = await client.query(
    `SELECT tn.*, d.full_name AS doctor_name FROM ipd_treatment_notes tn LEFT JOIN doctors d ON d.id = tn.doctor_id WHERE admission_id = $1 ORDER BY note_date ASC`,
    [admission.id]
  );
  const transfersRes = await client.query(`SELECT * FROM ipd_bed_transfers WHERE admission_id = $1 ORDER BY transfer_time ASC`, [admission.id]);

  const charges = chargesRes.rows.map((c) => ({ ...c, amount: round2(c.quantity * c.rate) }));
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const doctorVisitTotal = doctorVisitsRes.rows.reduce((s, v) => s + Number(v.fee), 0);
  const taxableValue = Math.max(0, chargesTotal + doctorVisitTotal - Number(admission.discount_amount));
  const gstAmount = round2(taxableValue * Number(admission.gst_percent) / 100);
  const grandTotal = round2(taxableValue + gstAmount);
  const paidAmount = Number(admission.advance_amount) + paymentsRes.rows.reduce((s, p) => s + Number(p.amount), 0);
  const balanceDue = round2(grandTotal - paidAmount);

  const now = admission.discharge_date ? new Date(admission.discharge_date) : new Date();
  const lengthOfStayDays = Math.max(1, Math.ceil((now - new Date(admission.admission_date)) / 86400000));

  let paymentStatus = 'Unpaid';
  if (paidAmount >= grandTotal && grandTotal > 0) paymentStatus = 'Paid';
  else if (paidAmount > 0) paymentStatus = 'Partially Paid';

  return {
    ...admission, charges, payments: paymentsRes.rows, doctorVisits: doctorVisitsRes.rows, treatmentNotes: treatmentNotesRes.rows, transfers: transfersRes.rows,
    chargesTotal, doctorVisitTotal, taxableValue, gstAmount, grandTotal, paidAmount, balanceDue, paymentStatus, lengthOfStayDays,
  };
}

// GET /api/ipd/admissions?search=&status=
router.get('/admissions', requirePermission('ipd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status = '' } = req.query;

  const conditions = ['a.hospital_id = $1', '(p.full_name ILIKE $2 OR p.uhid ILIKE $2 OR a.admission_number ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT a.*, p.full_name AS patient_name, p.uhid AS patient_uhid, b.bed_number, w.name AS ward_name, d.full_name AS doctor_name,
            COALESCE((SELECT SUM(amount) FROM ipd_payments WHERE admission_id = a.id), 0) AS payments_sum
     FROM ipd_admissions a
     JOIN patients p ON p.id = a.patient_id
     JOIN beds b ON b.id = a.bed_id
     JOIN wards w ON w.id = b.ward_id
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.admission_date DESC`,
    params
  );

  const wardsBedsRes = await pool.query(`SELECT COUNT(*) AS total FROM beds b JOIN wards w ON w.id = b.ward_id WHERE w.hospital_id = $1`, [hospitalId]);
  const occupiedRes = await pool.query(`SELECT COUNT(*) AS occupied FROM beds b JOIN wards w ON w.id = b.ward_id WHERE w.hospital_id = $1 AND b.status = 'Occupied'`, [hospitalId]);

  res.json({
    admissions: result.rows,
    stats: {
      admitted: result.rows.filter((a) => a.status === 'Admitted').length,
      discharged: result.rows.filter((a) => a.status === 'Discharged').length,
      totalBeds: Number(wardsBedsRes.rows[0].total),
      occupiedBeds: Number(occupiedRes.rows[0].occupied),
    },
    dischargeTypes: DISCHARGE_TYPES,
  });
});

router.get('/admissions/:id', requirePermission('ipd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const result = await pool.query(
    `SELECT a.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age, b.bed_number, w.name AS ward_name, d.full_name AS doctor_name
     FROM ipd_admissions a
     JOIN patients p ON p.id = a.patient_id
     JOIN beds b ON b.id = a.bed_id
     JOIN wards w ON w.id = b.ward_id
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE a.id = $1 AND a.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Admission not found.' });

  res.json(await hydrateAdmission(pool, result.rows[0]));
});

// ---- Write-route helpers ----
const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && v !== '' && v !== null;
const isMoneyValue = (v, max = 99999999.99) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max;
const validDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// An admission id arrives in the URL and is a global serial: it must belong to this hospital.
async function findAdmission(client, hospitalId, id, { lock = false } = {}) {
  if (!isPositiveInt(id)) return null;
  const res = await client.query(`SELECT * FROM ipd_admissions WHERE id = $1 AND hospital_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, hospitalId]);
  return res.rows[0] || null;
}

// Beds belong to a ward, which belongs to a hospital.
async function findBed(client, hospitalId, bedId, { lock = false } = {}) {
  if (!isPositiveInt(bedId)) return null;
  const res = await client.query(
    `SELECT b.*, w.rate_per_day, w.is_active AS ward_active FROM beds b JOIN wards w ON w.id = b.ward_id
     WHERE b.id = $1 AND w.hospital_id = $2${lock ? ' FOR UPDATE OF b' : ''}`,
    [bedId, hospitalId]
  );
  return res.rows[0] || null;
}

async function belongs(client, table, hospitalId, id) {
  if (id === undefined || id === null || id === '') return true; // optional reference left empty
  if (!isPositiveInt(id)) return false;
  const res = await client.query(`SELECT 1 FROM ${table} WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]); // table is a literal at every call site
  return !!res.rows[0];
}

// POST /api/ipd/admissions { patientId, bedId, doctorId?, diagnosis, expectedDischargeDate?, bhtNo?, referredBy?, advanceAmount?, panelId?, cardNo? }
router.post('/admissions', requirePermission('ipd.admit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.patientId || !b.bedId) return res.status(400).json({ message: 'Patient and bed are required.' });
  if (b.advanceAmount !== undefined && b.advanceAmount !== '' && !isMoneyValue(b.advanceAmount)) return res.status(400).json({ message: 'Advance amount must be 0 or more.' });
  if (b.expectedDischargeDate && !validDate(b.expectedDischargeDate)) return res.status(400).json({ message: 'Expected discharge date is not valid.' });
  if (b.panelId && !isPositiveInt(b.panelId)) return res.status(400).json({ message: 'Invalid panel.' });
  for (const [label, v, max] of [['Diagnosis', b.diagnosis, 1000], ['BHT number', b.bhtNo, 50], ['Referred by', b.referredBy, 150], ['Card number', b.cardNo, 50]]) {
    if (v && String(v).length > max) return res.status(400).json({ message: `${label} must be ${max} characters or fewer.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Patient and doctor must be this hospital's own.
    if (!(await belongs(client, 'patients', hospitalId, b.patientId))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Patient not found.' });
    }
    if (!(await belongs(client, 'doctors', hospitalId, b.doctorId))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    // Lock the bed row so two admissions racing for the same bed cannot both succeed.
    const bed = await findBed(client, hospitalId, b.bedId, { lock: true });
    if (!bed) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bed not found.' });
    }
    if (!bed.ward_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This ward is inactive.' });
    }
    if (bed.status !== 'Available') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Bed ${bed.bed_number} is not available (status: ${bed.status}).` });
    }

    // One active admission per patient at a time.
    const already = await client.query(`SELECT admission_number FROM ipd_admissions WHERE hospital_id = $1 AND patient_id = $2 AND status = 'Admitted' LIMIT 1`, [hospitalId, b.patientId]);
    if (already.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `This patient is already admitted (${already.rows[0].admission_number}). Discharge or transfer them first.` });
    }

    const admissionNumber = await generateAdmissionNumber(client);
    const admissionRes = await client.query(
      `INSERT INTO ipd_admissions (hospital_id, admission_number, patient_id, bed_id, room_rate_per_day, doctor_id, diagnosis, expected_discharge_date, bht_no, referred_by, advance_amount, panel_id, card_no, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        hospitalId, admissionNumber, b.patientId, b.bedId, bed.rate_per_day, b.doctorId || null, b.diagnosis, b.expectedDischargeDate || null,
        b.bhtNo, b.referredBy, b.advanceAmount || 0, b.panelId || null, b.cardNo, name,
      ]
    );
    await client.query(`UPDATE beds SET status = 'Occupied' WHERE id = $1`, [b.bedId]);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Admit Patient', module: 'IPD', details: `${admissionNumber} - bed ${bed.bed_number}`, ip: req.ip });
    res.status(201).json(admissionRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') return res.status(400).json({ message: 'A selected panel was not found.' });
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Charges / Payments / Doctor Visits / Treatment Notes ====================

router.post('/admissions/:id/charges', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { category, description, quantity, rate, chargeDate } = req.body;
  if (!CHARGE_CATEGORIES.includes(category)) return res.status(400).json({ message: 'Invalid charge category.' });
  if (!String(description || '').trim() || String(description).length > 300) return res.status(400).json({ message: 'A description of up to 300 characters is required.' });
  if (quantity !== undefined && !isPositiveInt(quantity)) return res.status(400).json({ message: 'Quantity must be a whole number greater than 0.' });
  if (rate !== undefined && !isMoneyValue(rate)) return res.status(400).json({ message: 'Rate must be 0 or more.' });
  if (chargeDate && !validDate(chargeDate)) return res.status(400).json({ message: 'Charge date is not valid.' });

  if (!(await findAdmission(pool, hospitalId, id))) return res.status(404).json({ message: 'Admission not found.' });

  const result = await pool.query(
    `INSERT INTO ipd_charge_lines (admission_id, charge_date, category, description, quantity, rate) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, chargeDate || new Date(), category, String(description).trim(), quantity || 1, rate || 0]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Add IPD Charge', module: 'IPD', details: `${category}: ${description}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

router.delete('/admissions/:id/charges/:chargeId', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id, chargeId } = req.params;
  if (!isPositiveInt(chargeId) || !isPositiveInt(id)) return res.status(404).json({ message: 'Charge not found.' });

  // The charge must belong to THIS admission, and the admission to THIS hospital.
  const result = await pool.query(
    `DELETE FROM ipd_charge_lines c USING ipd_admissions a
     WHERE c.id = $1 AND c.admission_id = $2 AND a.id = c.admission_id AND a.hospital_id = $3
     RETURNING c.id, c.category, c.description`,
    [chargeId, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Charge not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Remove IPD Charge', module: 'IPD', details: `Admission #${id}: ${result.rows[0].category} - ${result.rows[0].description}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Charge removed.' });
});

router.post('/admissions/:id/payments', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { amount, paymentMode, reference } = req.body;
  if (!isMoneyValue(amount) || Number(amount) <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' });
  if (!PAYMENT_MODES.includes(paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (reference && String(reference).length > 100) return res.status(400).json({ message: 'Reference must be 100 characters or fewer.' });

  if (!(await findAdmission(pool, hospitalId, id))) return res.status(404).json({ message: 'Admission not found.' });

  const result = await pool.query(
    `INSERT INTO ipd_payments (admission_id, amount, payment_mode, reference) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, amount, paymentMode, reference]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'IPD Payment', module: 'IPD', details: `₹${amount} via ${paymentMode}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

router.post('/admissions/:id/doctor-visits', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { doctorId, fee, remark } = req.body;
  if (fee !== undefined && !isMoneyValue(fee)) return res.status(400).json({ message: 'Fee must be 0 or more.' });
  if (remark && String(remark).length > 500) return res.status(400).json({ message: 'Remark must be 500 characters or fewer.' });

  if (!(await findAdmission(pool, hospitalId, id))) return res.status(404).json({ message: 'Admission not found.' });
  if (!(await belongs(pool, 'doctors', hospitalId, doctorId))) return res.status(404).json({ message: 'Doctor not found.' });

  const result = await pool.query(
    `INSERT INTO ipd_doctor_visits (admission_id, doctor_id, fee, remark) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, doctorId || null, fee || 0, remark]
  );
  res.status(201).json(result.rows[0]);
});

router.post('/admissions/:id/treatment-notes', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { doctorId, notes, remark, noteDate } = req.body;
  if (!String(notes || '').trim()) return res.status(400).json({ message: 'Treatment notes cannot be empty.' });
  if (String(notes).length > 4000 || (remark && String(remark).length > 500)) return res.status(400).json({ message: 'Notes are too long.' });
  if (noteDate && !validDate(noteDate)) return res.status(400).json({ message: 'Note date is not valid.' });

  if (!(await findAdmission(pool, hospitalId, id))) return res.status(404).json({ message: 'Admission not found.' });
  if (!(await belongs(pool, 'doctors', hospitalId, doctorId))) return res.status(404).json({ message: 'Doctor not found.' });

  const result = await pool.query(
    `INSERT INTO ipd_treatment_notes (admission_id, note_date, doctor_id, notes, remark) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, noteDate || new Date(), doctorId || null, String(notes).trim(), remark]
  );
  res.status(201).json(result.rows[0]);
});

// ==================== Bed Transfer ====================

router.post('/admissions/:id/transfer', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { toBedId, reason, authorizedBy } = req.body;
  if (!TRANSFER_REASONS.includes(reason)) return res.status(400).json({ message: 'Invalid transfer reason.' });
  if (!isPositiveInt(toBedId)) return res.status(400).json({ message: 'Select the destination bed.' });
  if (authorizedBy && String(authorizedBy).length > 150) return res.status(400).json({ message: 'Authorized-by must be 150 characters or fewer.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admissionRes = await client.query(`SELECT * FROM ipd_admissions WHERE id = $1 AND hospital_id = $2 AND status = 'Admitted' FOR UPDATE`, [isPositiveInt(id) ? id : 0, hospitalId]);
    const admission = admissionRes.rows[0];
    if (!admission) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Active admission not found.' });
    }
    if (Number(toBedId) === Number(admission.bed_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The patient is already in this bed.' });
    }

    // Lock both beds in id order so concurrent transfers cannot deadlock or double-book the destination.
    const [lo, hi] = [Number(admission.bed_id), Number(toBedId)].sort((a, c) => a - c);
    await client.query(`SELECT b.id FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id IN ($1,$2) AND w.hospital_id = $3 ORDER BY b.id FOR UPDATE OF b`, [lo, hi, hospitalId]);
    const newBed = await findBed(client, hospitalId, toBedId);
    if (!newBed || newBed.status !== 'Available' || !newBed.ward_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Destination bed is not available.' });
    }

    await client.query(
      `INSERT INTO ipd_bed_transfers (admission_id, from_bed_id, from_rate_per_day, to_bed_id, to_rate_per_day, reason, authorized_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, admission.bed_id, admission.room_rate_per_day, toBedId, newBed.rate_per_day, reason, authorizedBy || name]
    );

    await client.query(`UPDATE beds SET status = 'Available' WHERE id = $1`, [admission.bed_id]);
    await client.query(`UPDATE beds SET status = 'Occupied' WHERE id = $1`, [toBedId]);
    await client.query(`UPDATE ipd_admissions SET bed_id = $1, room_rate_per_day = $2 WHERE id = $3`, [toBedId, newBed.rate_per_day, id]);

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Bed Transfer', module: 'IPD', details: `${admission.admission_number}: bed ${admission.bed_id} -> ${toBedId} (${reason})`, ip: req.ip });
    res.json({ message: 'Patient transferred.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Discharge ====================

router.post('/admissions/:id/discharge', requirePermission('ipd.discharge'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { dischargeType, treatmentGiven, conditionAtDischarge, followUpInstructions, dischargeNotes, discountAmount } = req.body;
  if (!DISCHARGE_TYPES.includes(dischargeType || 'Normal')) return res.status(400).json({ message: 'Invalid discharge type.' });
  if (discountAmount !== undefined && discountAmount !== '' && !isMoneyValue(discountAmount)) return res.status(400).json({ message: 'Discount must be 0 or more.' });
  for (const [label, v] of [['Treatment given', treatmentGiven], ['Condition at discharge', conditionAtDischarge], ['Follow-up instructions', followUpInstructions], ['Discharge notes', dischargeNotes]]) {
    if (v && String(v).length > 4000) return res.status(400).json({ message: `${label} must be 4000 characters or fewer.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admissionRes = await client.query(`SELECT * FROM ipd_admissions WHERE id = $1 AND hospital_id = $2 AND status = 'Admitted' FOR UPDATE`, [isPositiveInt(id) ? id : 0, hospitalId]);
    const admission = admissionRes.rows[0];
    if (!admission) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only an active admission can be discharged.' });
    }

    const isExpired = dischargeType === 'Death';
    const result = await client.query(
      `UPDATE ipd_admissions SET status = 'Discharged', discharge_date = NOW(), discharge_type = $1,
         treatment_given = $2, condition_at_discharge = $3, follow_up_instructions = $4, discharge_notes = $5,
         discount_amount = $6, is_expired = $7, expired_date = $8
       WHERE id = $9 RETURNING *`,
      [dischargeType || 'Normal', treatmentGiven, conditionAtDischarge, followUpInstructions, dischargeNotes, discountAmount || 0, isExpired, isExpired ? new Date() : null, id]
    );
    await client.query(`UPDATE beds SET status = 'Cleaning' WHERE id = $1`, [admission.bed_id]);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Discharge Patient', module: 'IPD', details: `${admission.admission_number} (${dischargeType || 'Normal'})`, severity: isExpired ? 'Critical' : 'Info', ip: req.ip });
    res.json(await hydrateAdmission(pool, result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
