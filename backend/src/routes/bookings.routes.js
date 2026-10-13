const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { generateBookingNumber, generateBarcode } = require('../utils/bookingNumbers');
const { ensureReportForBooking } = require('../utils/reportShell');
const { dispatchNotification } = require('../utils/notifications');
const { isMoney, isPositiveInt, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const BOOKING_TYPES = ['Walk In', 'Online', 'Doctor Referral', 'Corporate', 'Collection Center', 'Home Collection'];
const STATUSES = ['Booked', 'Collected', 'Processing', 'Verified', 'Approved', 'Delivered', 'Cancelled'];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Cheque', 'Credit'];
const TIME_SLOTS = ['07:00 - 09:00', '09:00 - 11:00', '11:00 - 13:00', '16:00 - 18:00', '18:00 - 20:00'];
// "Collected" is deliberately absent: a home sample is only ever marked collected by the OTP check.
const DISPATCH_STATUSES = ['Scheduled', 'Assigned', 'En Route'];
const MAX_OTP_ATTEMPTS = 5;
const MAX_TESTS_PER_BOOKING = 200;

function paymentStatusFor(total, paid) {
  if (paid >= total && total > 0) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  return 'Pending';
}

// The home-collection OTP proves the patient was present when the sample was taken. It is shown once, to whoever
// creates the booking (so it can be handed to the patient), and never again in any read response.
function publicBooking(row) {
  if (!row) return row;
  const { otp_code: _otp, otp_attempts: _attempts, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
}

function newOtp() {
  return String(crypto.randomInt(1000, 10000));
}

function otpMatches(supplied, stored) {
  if (typeof supplied !== 'string' || typeof stored !== 'string' || supplied.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(stored));
}

// Allowed status moves. Cancelled and Delivered are final; a booking can only be cancelled before reporting starts.
function transitionError(from, to) {
  if (from === to) return null;
  if (from === 'Cancelled') return 'A cancelled booking cannot be reopened. Create a new booking instead.';
  if (from === 'Delivered') return 'A delivered booking can no longer change status.';
  if (to === 'Cancelled' && !['Booked', 'Collected', 'Processing'].includes(from)) {
    return `A booking that is ${from} can no longer be cancelled.`;
  }
  return null;
}

/**
 * The one place a booking's status changes. Records the history event, lazily creates the report shell once the
 * booking moves past "Booked" (mirrors EnsureReportForBooking in the original), and sends the "Sample Collected"
 * notification. Used by the status route, the home-collection OTP check and receive-at-lab, so every path behaves
 * the same - previously only the plain status route created the report shell.
 */
async function applyStatus(client, { hospitalId, bookingId, status, name, extraSet = '', extraParams = [] }) {
  const result = await client.query(
    `UPDATE bookings SET status = $1${extraSet ? `, ${extraSet}` : ''} WHERE id = $2 AND hospital_id = $3 RETURNING *`,
    [status, bookingId, hospitalId, ...extraParams]
  );
  const booking = result.rows[0];
  if (!booking) return null;

  await client.query(`INSERT INTO booking_status_events (booking_id, status, changed_by) VALUES ($1,$2,$3)`, [bookingId, status, name]);

  if (status !== 'Booked' && status !== 'Cancelled') {
    await ensureReportForBooking(client, bookingId);
  }

  // Fixed gap: wires the original's dormant "Sample Collected" template to a real trigger.
  if (status === 'Collected') {
    const patientRes = await client.query(
      `SELECT p.full_name, p.email, p.phone, COALESCE(MAX(t.turnaround_hours), 6) AS max_turnaround_hours
       FROM bookings b JOIN patients p ON p.id = b.patient_id
       LEFT JOIN booking_tests bt ON bt.booking_id = b.id LEFT JOIN tests t ON t.id = bt.test_id
       WHERE b.id = $1 GROUP BY p.full_name, p.email, p.phone`,
      [bookingId]
    );
    const patient = patientRes.rows[0];
    if (patient) {
      await dispatchNotification(client, {
        hospitalId,
        triggerEvent: 'Sample Collected',
        placeholders: { PatientName: patient.full_name, BarcodeValue: booking.barcode_value || 'N/A', TurnAroundHours: patient.max_turnaround_hours },
        recipient: { email: patient.email, phone: patient.phone },
      });
    }
  }
  return booking;
}

// GET /api/bookings?search=&status=&bookingType=
router.get('/', requirePermission('bookings.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status = '', bookingType = '' } = req.query;

  const conditions = ['b.hospital_id = $1', '(p.full_name ILIKE $2 OR b.booking_number ILIKE $2 OR p.uhid ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (status) { params.push(status); conditions.push(`b.status = $${params.length}`); }
  if (bookingType) { params.push(bookingType); conditions.push(`b.booking_type = $${params.length}`); }

  const result = await pool.query(
    `SELECT b.*, p.full_name AS patient_name, p.uhid AS patient_uhid, d.full_name AS doctor_name,
            (SELECT COUNT(*) FROM booking_tests bt WHERE bt.booking_id = b.id) AS test_count
     FROM bookings b
     JOIN patients p ON p.id = b.patient_id
     LEFT JOIN doctors d ON d.id = b.doctor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.booking_date DESC`,
    params
  );

  const statsRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE booking_date::date = CURRENT_DATE) AS today_count,
       COUNT(*) FILTER (WHERE status = 'Booked') AS pending_collection,
       COUNT(*) FILTER (WHERE status IN ('Collected', 'Processing')) AS in_process,
       COUNT(*) FILTER (WHERE status = 'Delivered') AS delivered
     FROM bookings WHERE hospital_id = $1`,
    [hospitalId]
  );

  res.json({ bookings: result.rows.map(publicBooking), stats: statsRes.rows[0], bookingTypes: BOOKING_TYPES, statuses: STATUSES, paymentModes: PAYMENT_MODES, timeSlots: TIME_SLOTS });
});

// GET /api/bookings/:id
router.get('/:id', requirePermission('bookings.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Booking not found.' });

  const bookingRes = await pool.query(
    `SELECT b.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.phone AS patient_phone,
            d.full_name AS doctor_name, u.full_name AS phlebotomist_name
     FROM bookings b
     JOIN patients p ON p.id = b.patient_id
     LEFT JOIN doctors d ON d.id = b.doctor_id
     LEFT JOIN users u ON u.id = b.phlebotomist_id
     WHERE b.id = $1 AND b.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!bookingRes.rows[0]) return res.status(404).json({ message: 'Booking not found.' });

  const testsRes = await pool.query(
    `SELECT bt.*, t.name AS test_name, t.code AS test_code, t.turnaround_hours
     FROM booking_tests bt JOIN tests t ON t.id = bt.test_id WHERE bt.booking_id = $1`,
    [id]
  );

  const historyRes = await pool.query(
    `SELECT * FROM booking_status_events WHERE booking_id = $1 ORDER BY changed_at ASC`,
    [id]
  );

  res.json({ booking: publicBooking(bookingRes.rows[0]), tests: testsRes.rows, statusHistory: historyRes.rows, statuses: STATUSES });
});

// POST /api/bookings
// body: { patientId, doctorId?, bookingType, testIds: [], packageIds: [], paidAmount, paymentMode,
//         notes?, scheduledDate?, scheduledSlot?, collectionAddress?, landmark?, pincode?, homeVisitCharge? }
router.post('/', requirePermission('bookings.create'), async (req, res) => {
  const { hospitalId, userId, name } = req.user;
  const b = req.body;

  if (!b.patientId) return res.status(400).json({ message: 'Patient is required.' });
  if (!BOOKING_TYPES.includes(b.bookingType || 'Walk In')) return res.status(400).json({ message: 'Invalid booking type.' });
  const bookingType = b.bookingType || 'Walk In';

  const rawTestIds = b.testIds || [];
  const rawPackageIds = b.packageIds || [];
  if (!Array.isArray(rawTestIds) || !Array.isArray(rawPackageIds) || rawTestIds.length > MAX_TESTS_PER_BOOKING || rawPackageIds.length > MAX_TESTS_PER_BOOKING) {
    return res.status(400).json({ message: 'Invalid test or package selection.' });
  }
  if ([...rawTestIds, ...rawPackageIds].some((v) => !isPositiveInt(v))) return res.status(400).json({ message: 'Invalid test or package selection.' });

  if (b.paidAmount !== undefined && b.paidAmount !== '' && !isMoney(b.paidAmount)) return res.status(400).json({ message: 'Paid amount must be 0 or more.' });
  if (b.paymentMode !== undefined && !PAYMENT_MODES.includes(b.paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (b.homeVisitCharge !== undefined && b.homeVisitCharge !== '' && !isMoney(b.homeVisitCharge, 99999.99)) return res.status(400).json({ message: 'Home visit charge must be 0 or more.' });
  if (b.notes && String(b.notes).length > 1000) return res.status(400).json({ message: 'Notes must be 1000 characters or fewer.' });
  if (b.scheduledDate && !isDateString(b.scheduledDate)) return res.status(400).json({ message: 'Scheduled date is not a valid date.' });
  if (b.scheduledSlot && !TIME_SLOTS.includes(b.scheduledSlot)) return res.status(400).json({ message: 'Invalid time slot.' });
  if (b.collectionAddress && String(b.collectionAddress).length > 400) return res.status(400).json({ message: 'Collection address must be 400 characters or fewer.' });
  if (b.landmark && String(b.landmark).length > 150) return res.status(400).json({ message: 'Landmark must be 150 characters or fewer.' });
  if (b.pincode && !/^[0-9]{4,10}$/.test(String(b.pincode))) return res.status(400).json({ message: 'Enter a valid pincode.' });
  for (const k of ['doctorId', 'ipdAdmissionId', 'opdVisitId']) {
    if (b[k] && !isPositiveInt(b[k])) return res.status(400).json({ message: `Invalid ${k}.` });
  }

  const testIds = new Set(rawTestIds.map(Number));
  const packageSelections = []; // { packageId, testId }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Every id the caller sends is a global serial; each must belong to THIS hospital.
    if (!(await idsBelongToHospital(client, 'patients', hospitalId, [b.patientId]))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Patient not found.' });
    }
    if (b.doctorId && !(await idsBelongToHospital(client, 'doctors', hospitalId, [b.doctorId]))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    if (b.opdVisitId) {
      const visit = await client.query(`SELECT patient_id FROM opd_visits WHERE id = $1 AND hospital_id = $2`, [b.opdVisitId, hospitalId]);
      if (!visit.rows[0] || visit.rows[0].patient_id !== Number(b.patientId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'That OPD visit does not belong to this patient.' });
      }
    }
    let admission = null;
    if (b.ipdAdmissionId) {
      const adm = await client.query(`SELECT id, patient_id, status FROM ipd_admissions WHERE id = $1 AND hospital_id = $2`, [b.ipdAdmissionId, hospitalId]);
      admission = adm.rows[0];
      if (!admission || admission.patient_id !== Number(b.patientId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'That IPD admission does not belong to this patient.' });
      }
    }

    // Expand packages into their constituent tests, tracking provenance (preserves package
    // selection info that the original app discarded after expansion).
    if (rawPackageIds.length > 0) {
      const ownPackages = await client.query(`SELECT id FROM test_packages WHERE id = ANY($1::int[]) AND hospital_id = $2 AND is_active = TRUE`, [rawPackageIds.map(Number), hospitalId]);
      if (ownPackages.rows.length !== new Set(rawPackageIds.map(Number)).size) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'One or more packages were not found.' });
      }
      for (const packageId of new Set(rawPackageIds.map(Number))) {
        const itemsRes = await client.query(`SELECT test_id FROM test_package_items WHERE package_id = $1`, [packageId]);
        for (const row of itemsRes.rows) {
          testIds.add(row.test_id);
          packageSelections.push({ packageId, testId: row.test_id });
        }
      }
    }

    if (testIds.size === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Select at least one test or package.' });
    }

    // Prices come from the database, and only for this hospital's active tests. Any id that does not come back
    // is foreign, unknown or inactive - rejecting it stops "free" tests from other hospitals sneaking in at price 0.
    const priceRes = await client.query(
      `SELECT id, price FROM tests WHERE id = ANY($1::int[]) AND hospital_id = $2 AND is_active = TRUE`,
      [[...testIds], hospitalId]
    );
    if (priceRes.rows.length !== testIds.size) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'One or more tests were not found or are inactive.' });
    }
    const priceMap = new Map(priceRes.rows.map((r) => [r.id, Number(r.price)]));
    const totalAmount = [...testIds].reduce((sum, id) => sum + priceMap.get(id), 0);

    const paidAmount = Number(b.paidAmount || 0);
    if (paidAmount > totalAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Paid amount cannot exceed the total amount.' });
    }

    if (bookingType === 'Home Collection') {
      if (!b.scheduledDate || !b.scheduledSlot || !b.collectionAddress) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Scheduled date, time slot, and collection address are required for home collection.' });
      }
    }

    const bookingNumber = await generateBookingNumber(client);
    const barcodeValue = await generateBarcode(client, hospitalId);
    const paymentStatus = paymentStatusFor(totalAmount, paidAmount);
    const otpCode = bookingType === 'Home Collection' ? newOtp() : null;

    const bookingRes = await client.query(
      `INSERT INTO bookings (
         hospital_id, booking_number, patient_id, doctor_id, booking_type, status,
         total_amount, paid_amount, payment_status, payment_mode, barcode_value, notes,
         scheduled_date, scheduled_slot, collection_address, landmark, pincode,
         phlebotomist_status, otp_code, home_visit_charge, ipd_admission_id, opd_visit_id
       ) VALUES ($1,$2,$3,$4,$5,'Booked',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        hospitalId, bookingNumber, b.patientId, b.doctorId || null, bookingType,
        totalAmount, paidAmount, paymentStatus, b.paymentMode || 'Cash', barcodeValue, b.notes || null,
        b.scheduledDate || null, b.scheduledSlot || null, b.collectionAddress || null, b.landmark || null, b.pincode || null,
        bookingType === 'Home Collection' ? 'Scheduled' : null, otpCode, b.homeVisitCharge || 0,
        b.ipdAdmissionId || null, b.opdVisitId || null,
      ]
    );
    const booking = bookingRes.rows[0];

    for (const testId of testIds) {
      const sourcePackage = packageSelections.find((s) => s.testId === testId)?.packageId || null;
      await client.query(
        `INSERT INTO booking_tests (booking_id, test_id, price_at_booking, source_package_id) VALUES ($1,$2,$3,$4)`,
        [booking.id, testId, priceMap.get(testId), sourcePackage]
      );
    }

    await client.query(
      `INSERT INTO booking_status_events (booking_id, status, changed_by) VALUES ($1, 'Booked', $2)`,
      [booking.id, name]
    );

    if (b.doctorId) {
      await client.query(`UPDATE doctors SET total_referrals = total_referrals + 1, total_revenue = total_revenue + $1 WHERE id = $2 AND hospital_id = $3`, [totalAmount, b.doctorId, hospitalId]);
    }

    // Fixed gap vs. the original: auto-post an "Investigation" charge onto the patient's
    // active IPD stay when this booking is made against an admission, instead of leaving it
    // as a disconnected cash transaction (the original had no linkage at all here).
    if (admission && admission.status === 'Admitted') {
      await client.query(
        `INSERT INTO ipd_charge_lines (admission_id, category, description, quantity, rate, booking_id)
         VALUES ($1, 'Investigation', $2, 1, $3, $4)`,
        [admission.id, `Lab tests - booking ${bookingNumber}`, totalAmount, booking.id]
      );
    }

    // Fixed gap: the original seeded a "Booking Confirmed" template but never wired any
    // code to actually send it - this is the first of 5 dormant trigger events this rebuild
    // wires to a real call site (still simulated/logged, no real provider).
    const patientRes = await client.query(`SELECT full_name, email, phone FROM patients WHERE id = $1`, [b.patientId]);
    const patient = patientRes.rows[0];
    if (patient) {
      await dispatchNotification(client, {
        hospitalId,
        triggerEvent: 'Booking Confirmed',
        placeholders: { PatientName: patient.full_name, BookingNumber: bookingNumber, ScheduledSlot: b.scheduledSlot || 'N/A' },
        recipient: { email: patient.email, phone: patient.phone },
      });
    }

    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId, userName: name, role: req.user.role, action: 'Create Booking', module: 'Bookings', details: `${bookingNumber} (${bookingType})`, ip: req.ip });
    // The OTP is returned here, once, so it can be given to the patient. publicBooking() strips it everywhere else.
    res.status(201).json({ ...publicBooking(booking), otpForPatient: otpCode });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/bookings/:id/status { status }
router.patch('/:id/status', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Booking not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT status, booking_type FROM bookings WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }
    const problem = transitionError(current.rows[0].status, status);
    if (problem) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: problem });
    }
    // A home-collection booking leaves "Booked" only through the OTP check (or by being cancelled). Letting the
    // status route move it on would skip the proof that the patient was present.
    if (current.rows[0].booking_type === 'Home Collection' && current.rows[0].status === 'Booked' && !['Booked', 'Cancelled'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'A home-collection sample is marked collected by verifying the patient OTP.' });
    }

    const booking = await applyStatus(client, { hospitalId, bookingId: id, status, name });
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update Booking Status', module: 'Bookings', details: `${booking.booking_number} -> ${status}`, ip: req.ip });
    res.json(publicBooking(booking));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/bookings/:id/assign-phlebotomist { phlebotomistId }
router.patch('/:id/assign-phlebotomist', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { phlebotomistId } = req.body;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Home collection booking not found.' });
  if (!isPositiveInt(phlebotomistId)) return res.status(400).json({ message: 'Select a phlebotomist.' });

  // The assignee must be an active user of this hospital.
  const user = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND hospital_id = $2 AND is_active = TRUE`, [phlebotomistId, hospitalId]);
  if (!user.rows[0]) return res.status(404).json({ message: 'Phlebotomist not found.' });

  const result = await pool.query(
    `UPDATE bookings SET phlebotomist_id = $1, phlebotomist_status = 'Assigned'
     WHERE id = $2 AND hospital_id = $3 AND booking_type = 'Home Collection' AND status = 'Booked' RETURNING *`,
    [phlebotomistId, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Open home collection booking not found.' });
  res.json(publicBooking(result.rows[0]));
});

// PATCH /api/bookings/:id/phlebotomist-status { status } - Scheduled|Assigned|En Route
router.patch('/:id/phlebotomist-status', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { status } = req.body;
  if (!DISPATCH_STATUSES.includes(status)) return res.status(400).json({ message: `Status must be one of: ${DISPATCH_STATUSES.join(', ')}. Collection is confirmed with the OTP.` });
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Home collection booking not found.' });

  const result = await pool.query(
    `UPDATE bookings SET phlebotomist_status = $1 WHERE id = $2 AND hospital_id = $3 AND booking_type = 'Home Collection' AND status = 'Booked' RETURNING *`,
    [status, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Open home collection booking not found.' });
  res.json(publicBooking(result.rows[0]));
});

// POST /api/bookings/:id/verify-otp-collect { otp, vialBarcodes }
router.post('/:id/verify-otp-collect', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { otp, vialBarcodes } = req.body;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Booking not found.' });
  if (typeof otp !== 'string' || !/^\d{4}$/.test(otp)) return res.status(400).json({ message: 'Enter the 4-digit OTP.' });
  if (vialBarcodes && String(vialBarcodes).length > 300) return res.status(400).json({ message: 'Vial barcodes must be 300 characters or fewer.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes = await client.query(`SELECT * FROM bookings WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    const booking = bookingRes.rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }
    // Only an open home-collection booking has an OTP to check. (A booking with no OTP used to "match" a missing one.)
    if (booking.booking_type !== 'Home Collection' || !booking.otp_code || booking.status !== 'Booked') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This booking is not waiting for a home-collection OTP.' });
    }
    if (booking.otp_attempts >= MAX_OTP_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(423).json({ message: 'Too many wrong attempts. Ask a supervisor to issue a new OTP.' });
    }
    if (!otpMatches(otp, booking.otp_code)) {
      await client.query(`UPDATE bookings SET otp_attempts = otp_attempts + 1 WHERE id = $1`, [id]);
      await client.query('COMMIT'); // keep the counter even though the request fails
      const left = Math.max(0, MAX_OTP_ATTEMPTS - (booking.otp_attempts + 1));
      return res.status(400).json({ message: left > 0 ? `Incorrect OTP. ${left} attempt(s) left.` : 'Incorrect OTP. No attempts left; ask a supervisor to issue a new OTP.' });
    }

    const collected = await applyStatus(client, {
      hospitalId, bookingId: id, status: 'Collected', name,
      extraSet: `phlebotomist_status = 'Collected', sample_vial_barcodes = $4, collected_at = NOW(), otp_attempts = 0`,
      extraParams: [vialBarcodes || null],
    });
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Home Collection Verified', module: 'Bookings', details: collected.booking_number, ip: req.ip });
    res.json(publicBooking(collected));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/bookings/:id/reset-otp - supervisor issues a fresh OTP after the attempts ran out (or it was lost)
router.post('/:id/reset-otp', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Booking not found.' });

  const otp = newOtp();
  const result = await pool.query(
    `UPDATE bookings SET otp_code = $1, otp_attempts = 0
     WHERE id = $2 AND hospital_id = $3 AND booking_type = 'Home Collection' AND status = 'Booked' RETURNING booking_number`,
    [otp, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Open home collection booking not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Reissue Home Collection OTP', module: 'Bookings', details: result.rows[0].booking_number, severity: 'Warning', ip: req.ip });
  res.json({ otpForPatient: otp });
});

// PATCH /api/bookings/:id/receive-at-lab
router.patch('/:id/receive-at-lab', requirePermission('bookings.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Booking not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT status, received_at_lab_at FROM bookings WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }
    // A sample can only arrive at the lab after it has been collected.
    if (current.rows[0].status !== 'Collected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only a collected sample can be received at the lab.' });
    }
    const booking = await applyStatus(client, { hospitalId, bookingId: id, status: 'Processing', name, extraSet: 'received_at_lab_at = NOW()' });
    await client.query('COMMIT');
    res.json(publicBooking(booking));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
