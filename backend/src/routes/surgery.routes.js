const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isPositiveInt, isMoney, isDateString, idsBelongToHospital } = require('../utils/validate');
const { generateBookingNumber, generateBarcode } = require('../utils/bookingNumbers');

const router = express.Router();
router.use(requireAuth);

// Ids are numeric serials; anything else is simply "not found" (instead of a 500 from Postgres).
router.param('id', (req, res, next, v) => (isPositiveInt(v) && Number(v) < 2147483647 ? next() : res.status(404).json({ message: 'Not found.' })));

const MAX_CASE_HOURS = 24;
const tooLong = (v, n) => v !== undefined && v !== null && String(v).length > n;

const THEATRE_STATUSES = ['Available', 'In Surgery', 'Under Fumigation', 'Maintenance'];
const SURGERY_TYPES = ['Major', 'Minor', 'Emergency', 'Day Care'];
const PRIORITIES = ['Elective', 'Urgent', 'Emergency', 'Stat'];
const CASE_STATUSES = ['Scheduled', 'Pre-Op Holding', 'In Surgery', 'PACU / Recovery', 'Completed', 'Cancelled', 'Postponed'];
const FUMIGATION_TYPES = ['Bacillocid / Hydrogen Peroxide Mist', 'Formaldehyde Fumigation', 'UV-C Disinfection', 'Autoclave Sterilization'];
const CLEARANCE_STATUSES = ['Pending', 'Negative', 'Sterile', 'Positive', 'Contaminated'];

async function generateCaseNumber(client) {
  const seqRes = await client.query(`SELECT nextval('surgery_case_number_seq') AS seq`);
  const year = new Date().getFullYear();
  return `OT-${year}-${String(seqRes.rows[0].seq).padStart(3, '0')}`;
}

/**
 * Conflict detection — mirrors the original's CheckOTSlotConflict exactly: a room-overlap
 * check and a lead-surgeon-overlap check, both using classic interval overlap
 * (start < otherEnd && end > otherStart), excluding Cancelled/Completed bookings and the
 * booking being edited (excludeId).
 */
async function checkSlotConflict(client, { hospitalId, theatreId, surgeonId, start, end, excludeId }) {
  // Serialise concurrent bookings for the same theatre / surgeon (the overlap check alone is racy).
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1001, Number(theatreId)]);
  if (surgeonId) await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1002, Number(surgeonId)]);

  const roomConflict = await client.query(
    `SELECT sb.*, s.name AS surgery_name FROM surgery_bookings sb
     JOIN surgery_masters s ON s.id = sb.surgery_id
     WHERE sb.hospital_id = $5 AND sb.operation_theatre_id = $1 AND sb.status NOT IN ('Cancelled', 'Completed')
       AND ($2::int IS NULL OR sb.id != $2)
       AND sb.scheduled_start_time < $4 AND sb.scheduled_end_time > $3`,
    [theatreId, excludeId || null, start, end, hospitalId]
  );
  if (roomConflict.rows[0]) {
    const c = roomConflict.rows[0];
    return { conflict: true, reason: `Theatre already booked for "${c.surgery_name}" from ${new Date(c.scheduled_start_time).toLocaleString('en-IN')} to ${new Date(c.scheduled_end_time).toLocaleString('en-IN')}.` };
  }

  if (surgeonId) {
    const surgeonConflict = await client.query(
      `SELECT sb.*, s.name AS surgery_name FROM surgery_bookings sb
       JOIN surgery_masters s ON s.id = sb.surgery_id
       WHERE sb.hospital_id = $5 AND sb.lead_surgeon_id = $1 AND sb.status NOT IN ('Cancelled', 'Completed')
         AND ($2::int IS NULL OR sb.id != $2)
         AND sb.scheduled_start_time < $4 AND sb.scheduled_end_time > $3`,
      [surgeonId, excludeId || null, start, end, hospitalId]
    );
    if (surgeonConflict.rows[0]) {
      const c = surgeonConflict.rows[0];
      return { conflict: true, reason: `Lead surgeon is already booked for "${c.surgery_name}" from ${new Date(c.scheduled_start_time).toLocaleString('en-IN')} to ${new Date(c.scheduled_end_time).toLocaleString('en-IN')}.` };
    }
  }

  return { conflict: false };
}

// ==================== Operation Theatres ====================

router.get('/theatres', requirePermission('surgery.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM operation_theatres WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]);
  res.json({ theatres: result.rows, statuses: THEATRE_STATUSES });
});

router.post('/theatres', requirePermission('surgery.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, roomNumber, floor, department, isModular, equipmentSummary } = req.body;
  if (!name || !String(name).trim() || tooLong(name, 100)) return res.status(400).json({ message: 'Name is required (max 100 characters).' });
  if (tooLong(roomNumber, 30) || tooLong(floor, 50) || tooLong(department, 100) || tooLong(equipmentSummary, 500)) {
    return res.status(400).json({ message: 'A field is too long (room 30, floor 50, department 100, equipment 500).' });
  }

  const result = await pool.query(
    `INSERT INTO operation_theatres (hospital_id, name, room_number, floor, department, is_modular, equipment_summary) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [hospitalId, String(name).trim(), roomNumber, floor || '1st Floor', department || 'General Surgery', isModular ?? true, equipmentSummary]
  );
  res.status(201).json(result.rows[0]);
});

router.patch('/theatres/:id/status', requirePermission('surgery.edit'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!THEATRE_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid theatre status.' });

  const { hospitalId } = req.user;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1001, Number(id)]);
    const cur = await client.query(`SELECT * FROM operation_theatres WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    if (!cur.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Theatre not found.' });
    }
    // "In Surgery" is driven by case status; a theatre with a live case cannot be switched to fumigation / maintenance / available by hand.
    const live = await client.query(`SELECT 1 FROM surgery_bookings WHERE operation_theatre_id = $1 AND hospital_id = $2 AND status = 'In Surgery' LIMIT 1`, [id, hospitalId]);
    if (status === 'In Surgery') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'A theatre becomes "In Surgery" when a case is started; it cannot be set by hand.' });
    }
    if (live.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A surgery is in progress in this theatre. Complete or cancel it first.' });
    }
    const result = await client.query(`UPDATE operation_theatres SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Surgery Procedure Masters ====================

router.get('/masters', requirePermission('surgery.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM surgery_masters WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]);
  res.json({ surgeries: result.rows, surgeryTypes: SURGERY_TYPES });
});

router.post('/masters', requirePermission('surgery.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const b = req.body;
  if (!b.code || !String(b.code).trim() || tooLong(b.code, 30) || !b.name || !String(b.name).trim() || tooLong(b.name, 200)) {
    return res.status(400).json({ message: 'Code (max 30) and name (max 200) are required.' });
  }
  if (tooLong(b.department, 100)) return res.status(400).json({ message: 'Department is too long (max 100).' });
  if (b.surgeryType && !SURGERY_TYPES.includes(b.surgeryType)) return res.status(400).json({ message: 'Invalid surgery type.' });
  const duration = b.estimatedDurationMinutes === undefined || b.estimatedDurationMinutes === '' ? 90 : b.estimatedDurationMinutes;
  if (!isPositiveInt(duration) || Number(duration) > MAX_CASE_HOURS * 60) return res.status(400).json({ message: 'Estimated duration must be a whole number of minutes (1 to 1440).' });
  const cost = b.standardCost === undefined || b.standardCost === '' ? 0 : b.standardCost;
  if (!isMoney(cost)) return res.status(400).json({ message: 'Standard cost must be a valid non-negative amount.' });

  try {
    const result = await pool.query(
      `INSERT INTO surgery_masters (hospital_id, code, name, department, surgery_type, estimated_duration_minutes, standard_cost, requires_blood_arrangement, requires_icu_booking)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [hospitalId, String(b.code).trim(), String(b.name).trim(), b.department || 'General Surgery', b.surgeryType || 'Major', Number(duration), Number(cost), b.requiresBloodArrangement ?? true, b.requiresIcuBooking ?? false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Procedure code already exists.' });
    throw err;
  }
});

// ==================== Surgery Bookings (Schedule + Case Sheet) ====================

router.get('/bookings', requirePermission('surgery.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '', theatreId = '', date = '' } = req.query;

  const conditions = ['sb.hospital_id = $1'];
  const params = [hospitalId];
  if (status) {
    if (!CASE_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status filter.' });
    params.push(status); conditions.push(`sb.status = $${params.length}`);
  }
  if (theatreId) {
    if (!isPositiveInt(theatreId)) return res.status(400).json({ message: 'Invalid theatre filter.' });
    params.push(theatreId); conditions.push(`sb.operation_theatre_id = $${params.length}`);
  }
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isDateString(date)) return res.status(400).json({ message: 'Invalid date filter (use YYYY-MM-DD).' });
    params.push(date); conditions.push(`sb.scheduled_start_time::date = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT sb.*, p.full_name AS patient_name, p.uhid AS patient_uhid, s.name AS surgery_name, s.department,
            ot.name AS theatre_name, d.full_name AS lead_surgeon_name
     FROM surgery_bookings sb
     JOIN patients p ON p.id = sb.patient_id
     JOIN surgery_masters s ON s.id = sb.surgery_id
     JOIN operation_theatres ot ON ot.id = sb.operation_theatre_id
     LEFT JOIN doctors d ON d.id = sb.lead_surgeon_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sb.scheduled_start_time ASC`,
    params
  );

  res.json({
    bookings: result.rows,
    priorities: PRIORITIES, statuses: CASE_STATUSES,
    stats: {
      scheduled: result.rows.filter((b) => b.status === 'Scheduled').length,
      inSurgery: result.rows.filter((b) => b.status === 'In Surgery').length,
      completedToday: result.rows.filter((b) => b.status === 'Completed' && new Date(b.scheduled_start_time).toDateString() === new Date().toDateString()).length,
    },
  });
});

router.get('/bookings/:id', requirePermission('surgery.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT sb.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age, s.name AS surgery_name, s.department,
            ot.name AS theatre_name, d.full_name AS lead_surgeon_name, ia.admission_number
     FROM surgery_bookings sb
     JOIN patients p ON p.id = sb.patient_id
     JOIN surgery_masters s ON s.id = sb.surgery_id
     JOIN operation_theatres ot ON ot.id = sb.operation_theatre_id
     LEFT JOIN doctors d ON d.id = sb.lead_surgeon_id
     LEFT JOIN ipd_admissions ia ON ia.id = sb.ipd_admission_id
     WHERE sb.id = $1 AND sb.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Surgery booking not found.' });
  res.json(result.rows[0]);
});

// POST /api/surgery/bookings
router.post('/bookings', requirePermission('surgery.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!b.patientId || !b.surgeryId || !b.operationTheatreId || !b.scheduledStartTime || !b.scheduledEndTime) {
    return res.status(400).json({ message: 'Patient, procedure, theatre, and schedule time are required.' });
  }
  if (![b.patientId, b.surgeryId, b.operationTheatreId].every(isPositiveInt)
    || (b.leadSurgeonId && !isPositiveInt(b.leadSurgeonId)) || (b.ipdAdmissionId && !isPositiveInt(b.ipdAdmissionId))) {
    return res.status(400).json({ message: 'One of the selected ids is invalid.' });
  }
  if (!isDateString(String(b.scheduledStartTime)) || !isDateString(String(b.scheduledEndTime))) return res.status(400).json({ message: 'Invalid schedule time.' });
  const startMs = Date.parse(b.scheduledStartTime);
  const endMs = Date.parse(b.scheduledEndTime);
  if (endMs <= startMs) return res.status(400).json({ message: 'End time must be after the start time.' });
  if (endMs - startMs > MAX_CASE_HOURS * 3600000) return res.status(400).json({ message: `A case cannot be longer than ${MAX_CASE_HOURS} hours.` });
  if (b.priority && !PRIORITIES.includes(b.priority)) return res.status(400).json({ message: 'Invalid priority.' });
  if (tooLong(b.assistantSurgeonName, 150) || tooLong(b.anesthetistName, 150) || tooLong(b.scrubNurseName, 150) || tooLong(b.circulatingNurseName, 150) || tooLong(b.anesthesiaType, 50)) {
    return res.status(400).json({ message: 'A staff name or anesthesia type is too long.' });
  }
  const totalCost = b.totalCost === undefined || b.totalCost === '' ? 0 : b.totalCost;
  if (!isMoney(totalCost)) return res.status(400).json({ message: 'Total cost must be a valid non-negative amount.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Every referenced row must belong to this hospital (ids are global serials).
    const owned = (await idsBelongToHospital(client, 'patients', hospitalId, [b.patientId]))
      && (await idsBelongToHospital(client, 'doctors', hospitalId, [b.leadSurgeonId]))
      && (await client.query('SELECT 1 FROM surgery_masters WHERE id = $1 AND hospital_id = $2 AND is_active', [b.surgeryId, hospitalId])).rows.length === 1
      && (await client.query('SELECT 1 FROM operation_theatres WHERE id = $1 AND hospital_id = $2 AND is_active', [b.operationTheatreId, hospitalId])).rows.length === 1
      && (!b.ipdAdmissionId || (await client.query('SELECT 1 FROM ipd_admissions WHERE id = $1 AND hospital_id = $2 AND patient_id = $3', [b.ipdAdmissionId, hospitalId, b.patientId])).rows.length === 1);
    if (!owned) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Patient, procedure, theatre, surgeon or admission not found.' });
    }

    const conflictResult = await checkSlotConflict(client, {
      hospitalId, theatreId: b.operationTheatreId, surgeonId: b.leadSurgeonId, start: b.scheduledStartTime, end: b.scheduledEndTime,
    });
    if (conflictResult.conflict) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: conflictResult.reason });
    }

    const caseNumber = await generateCaseNumber(client);
    const result = await client.query(
      `INSERT INTO surgery_bookings (
         hospital_id, case_number, patient_id, ipd_admission_id, surgery_id, operation_theatre_id,
         lead_surgeon_id, assistant_surgeon_name, anesthetist_name, scrub_nurse_name, circulating_nurse_name, anesthesia_type,
         scheduled_start_time, scheduled_end_time, priority, total_cost, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        hospitalId, caseNumber, b.patientId, b.ipdAdmissionId || null, b.surgeryId, b.operationTheatreId,
        b.leadSurgeonId || null, b.assistantSurgeonName, b.anesthetistName, b.scrubNurseName, b.circulatingNurseName,
        b.anesthesiaType || 'General Anesthesia (GA)', b.scheduledStartTime, b.scheduledEndTime, b.priority || 'Elective', Number(totalCost), name,
      ]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Schedule Surgery', module: 'Surgery', details: caseNumber, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/surgery/bookings/:id/status { status, appendNote? }
router.patch('/bookings/:id/status', requirePermission('surgery.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { status, appendNote } = req.body;
  if (!CASE_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  if (appendNote !== undefined && appendNote !== null && typeof appendNote !== 'string') return res.status(400).json({ message: 'Note must be text.' });
  if (tooLong(appendNote, 1000)) return res.status(400).json({ message: 'A note can be at most 1000 characters.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes = await client.query(`SELECT * FROM surgery_bookings WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const booking = bookingRes.rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Surgery booking not found.' });
    }
    if (['Completed', 'Cancelled'].includes(booking.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `A ${booking.status} case cannot be changed.` });
    }
    if (status === 'In Surgery') {
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1001, Number(booking.operation_theatre_id)]);
      const busy = await client.query(
        `SELECT 1 FROM surgery_bookings WHERE hospital_id = $1 AND operation_theatre_id = $2 AND status = 'In Surgery' AND id <> $3 LIMIT 1`,
        [hospitalId, booking.operation_theatre_id, id]
      );
      const th = await client.query(`SELECT status FROM operation_theatres WHERE id = $1`, [booking.operation_theatre_id]);
      if (busy.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Another surgery is already in progress in this theatre.' });
      }
      if (['Under Fumigation', 'Maintenance'].includes(th.rows[0]?.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `Theatre is ${th.rows[0].status}.` });
      }
    }

    const timestampUpdates = {};
    if (status === 'In Surgery' && !booking.actual_start_time) timestampUpdates.actual_start_time = new Date();
    if ((status === 'PACU / Recovery' || status === 'Completed') && !booking.actual_end_time) timestampUpdates.actual_end_time = new Date();

    let newNotes = booking.surgical_notes;
    if (appendNote) {
      const stamped = `[${new Date().toLocaleString('en-IN')} - ${name}] ${appendNote}`;
      newNotes = newNotes ? `${newNotes}\n${stamped}` : stamped;
      if (newNotes.length > 4000) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'The surgical notes log is full (4000 characters).' });
      }
    }

    const result = await client.query(
      `UPDATE surgery_bookings SET status = $1, surgical_notes = $2,
         actual_start_time = COALESCE($3, actual_start_time), actual_end_time = COALESCE($4, actual_end_time)
       WHERE id = $5 AND hospital_id = $6 RETURNING *`,
      [status, newNotes, timestampUpdates.actual_start_time || null, timestampUpdates.actual_end_time || null, id, hospitalId]
    );

    // Theatre status follows the case status for the obvious in-surgery/available states.
    if (status === 'In Surgery') await client.query(`UPDATE operation_theatres SET status = 'In Surgery' WHERE id = $1 AND hospital_id = $2`, [booking.operation_theatre_id, hospitalId]);
    if (status === 'Completed' || status === 'Cancelled' || status === 'Postponed') await client.query(`UPDATE operation_theatres SET status = 'Available' WHERE id = $1 AND hospital_id = $2 AND status = 'In Surgery'`, [booking.operation_theatre_id, hospitalId]);

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update Surgery Status', module: 'Surgery', details: `${booking.case_number} -> ${status}`, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/surgery/bookings/:id/case-sheet - Pre-Op checklist, diagnoses, implant details
router.put('/bookings/:id/case-sheet', requirePermission('surgery.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;
  if (tooLong(b.preOpDiagnosis, 500) || tooLong(b.postOpDiagnosis, 500) || tooLong(b.implantDetails, 500)) {
    return res.status(400).json({ message: 'Diagnosis / implant details can be at most 500 characters.' });
  }

  const result = await pool.query(
    `UPDATE surgery_bookings SET
       pre_op_npo_confirmed=$1, pre_op_consent_signed=$2, pre_op_blood_arranged=$3, pre_op_pac_cleared=$4,
       pre_op_diagnosis=$5, post_op_diagnosis=$6, implant_details=$7
     WHERE id=$8 AND hospital_id=$9 AND status NOT IN ('Completed','Cancelled') RETURNING *`,
    [b.preOpNpoConfirmed ?? false, b.preOpConsentSigned ?? false, b.preOpBloodArranged ?? false, b.preOpPacCleared ?? false,
      b.preOpDiagnosis, b.postOpDiagnosis, b.implantDetails, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Surgery booking not found, or the case is already Completed / Cancelled.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update Case Sheet', module: 'Surgery', details: result.rows[0].case_number, ip: req.ip });
  res.json(result.rows[0]);
});

// POST /api/surgery/bookings/:id/send-specimen { testId, specimenDescription }
// Fixed gap: creates a REAL booking (histopathology test) instead of the original's cosmetic
// flags-only "dispatch."
router.post('/bookings/:id/send-specimen', requirePermission('surgery.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { testId, specimenDescription } = req.body;
  if (!isPositiveInt(testId)) return res.status(400).json({ message: 'Select the histopathology/biopsy test to dispatch.' });
  if (tooLong(specimenDescription, 250)) return res.status(400).json({ message: 'Specimen description can be at most 250 characters.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes = await client.query(`SELECT * FROM surgery_bookings WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const surgeryBooking = bookingRes.rows[0];
    if (!surgeryBooking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Surgery booking not found.' });
    }
    if (surgeryBooking.specimen_sent_to_pathology) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A specimen has already been sent to pathology for this case.' });
    }

    const testRes = await client.query(`SELECT * FROM tests WHERE id = $1 AND hospital_id = $2`, [testId, hospitalId]);
    const test = testRes.rows[0];
    if (!test) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Test not found.' });
    }

    const bookingNumber = await generateBookingNumber(client);
    const barcodeValue = await generateBarcode(client, hospitalId);

    const labBookingRes = await client.query(
      `INSERT INTO bookings (hospital_id, booking_number, patient_id, booking_type, status, total_amount, paid_amount, payment_status, barcode_value, notes)
       VALUES ($1,$2,$3,'Doctor Referral','Booked',$4,0,'Pending',$5,$6) RETURNING *`,
      [hospitalId, bookingNumber, surgeryBooking.patient_id, test.price, barcodeValue, `Surgical specimen from case ${surgeryBooking.case_number}: ${specimenDescription || ''}`]
    );
    const labBooking = labBookingRes.rows[0];

    await client.query(
      `INSERT INTO booking_tests (booking_id, test_id, price_at_booking) VALUES ($1,$2,$3)`,
      [labBooking.id, testId, test.price]
    );
    await client.query(`INSERT INTO booking_status_events (booking_id, status, changed_by) VALUES ($1, 'Booked', $2)`, [labBooking.id, name]);

    await client.query(
      `UPDATE surgery_bookings SET specimen_sent_to_pathology = TRUE, specimen_booking_id = $1, specimen_description = $2 WHERE id = $3`,
      [labBooking.id, specimenDescription, id]
    );

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Dispatch Specimen to Pathology', module: 'Surgery', details: `${surgeryBooking.case_number} -> lab booking ${bookingNumber}`, ip: req.ip });
    res.status(201).json({ surgeryBookingId: id, labBooking });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Fumigation Logs ====================

router.get('/fumigation', requirePermission('surgery.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT fl.*, ot.name AS theatre_name FROM ot_fumigation_logs fl
     JOIN operation_theatres ot ON ot.id = fl.operation_theatre_id
     WHERE ot.hospital_id = $1 ORDER BY fl.completed_at DESC`,
    [hospitalId]
  );
  res.json({ logs: result.rows, fumigationTypes: FUMIGATION_TYPES, clearanceStatuses: CLEARANCE_STATUSES });
});

router.post('/fumigation', requirePermission('surgery.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.operationTheatreId || !b.startedAt || !b.completedAt) return res.status(400).json({ message: 'Theatre, start time, and completion time are required.' });
  if (!isPositiveInt(b.operationTheatreId)) return res.status(400).json({ message: 'Invalid theatre.' });
  if (!isDateString(String(b.startedAt)) || !isDateString(String(b.completedAt))) return res.status(400).json({ message: 'Invalid start or completion time.' });
  if (Date.parse(b.completedAt) <= Date.parse(b.startedAt)) return res.status(400).json({ message: 'Completion time must be after the start time.' });
  if (b.fumigationType && !FUMIGATION_TYPES.includes(b.fumigationType)) return res.status(400).json({ message: 'Invalid fumigation type.' });
  if (b.microbiologyClearanceStatus && !CLEARANCE_STATUSES.includes(b.microbiologyClearanceStatus)) return res.status(400).json({ message: 'Invalid clearance status.' });
  if (tooLong(b.performedBy, 150) || tooLong(b.notes, 500)) return res.status(400).json({ message: 'Performed-by (150) or notes (500) is too long.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const th = await client.query(`SELECT 1 FROM operation_theatres WHERE id = $1 AND hospital_id = $2`, [b.operationTheatreId, hospitalId]);
    if (!th.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Theatre not found.' });
    }
    const result = await client.query(
      `INSERT INTO ot_fumigation_logs (operation_theatre_id, fumigation_type, started_at, completed_at, air_sample_sent_to_microbiology, microbiology_clearance_status, performed_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.operationTheatreId, b.fumigationType || FUMIGATION_TYPES[0], b.startedAt, b.completedAt, b.airSampleSentToMicrobiology ?? true, b.microbiologyClearanceStatus || 'Pending', b.performedBy || name, b.notes]
    );

    // Side-effect on the parent theatre, matches the original's hardcoded 7-day cadence exactly.
    const nextDue = new Date(b.completedAt);
    nextDue.setDate(nextDue.getDate() + 7);
    await client.query(`UPDATE operation_theatres SET last_fumigated_on = $1, next_fumigation_due = $2 WHERE id = $3 AND hospital_id = $4`, [b.completedAt, nextDue, b.operationTheatreId, hospitalId]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
