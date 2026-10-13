const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isPositiveInt, isDateString } = require('../utils/validate');
const { crossMatchUpload, uploadDir: crossMatchUploadDir } = require('../utils/upload');
const {
  generateUnitNumber, generateRequestNumber, generateIssueSlipNumber, generateReservationNumber,
} = require('../utils/bloodBankNumbers');

const router = express.Router();
router.use(requireAuth);

// Ids are numeric serials; anything else is simply "not found" (instead of a 500 from Postgres).
router.param('id', (req, res, next, v) => (isPositiveInt(v) && Number(v) < 2147483647 ? next() : res.status(404).json({ message: 'Not found.' })));

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENT_TYPES = ['Whole Blood', 'Packed RBC', 'Platelets', 'Plasma', 'Cryoprecipitate'];
const REQUEST_PRIORITIES = ['Normal', 'Urgent', 'Emergency', 'Critical'];
const RESERVATION_TYPES = ['Surgery', 'ICU', 'Emergency'];
const LOW_STOCK_THRESHOLD = 5;

// Validates a blood-unit body (create/update). Returns an error message or null; storage location is hospital-scoped.
async function validateUnitBody(b, hospitalId) {
  if (!b.donorName || !String(b.donorName).trim() || String(b.donorName).length > 150) return 'Donor name is required (max 150 characters).';
  if (!BLOOD_GROUPS.includes(b.bloodGroup)) return 'Select a valid blood group.';
  if (b.componentType && !COMPONENT_TYPES.includes(b.componentType)) return 'Invalid component type.';
  if (!b.collectedOn || !b.expiryDate || !isDateString(String(b.collectedOn)) || !isDateString(String(b.expiryDate))) return 'Valid collection and expiry dates are required.';
  if (new Date(b.expiryDate) <= new Date(b.collectedOn)) return 'Expiry date must be after the collection date.';
  if (b.volumeMl !== undefined && b.volumeMl !== null && b.volumeMl !== '' && (!isPositiveInt(b.volumeMl) || Number(b.volumeMl) > 2000)) return 'Volume must be a whole number between 1 and 2000 ml.';
  if (b.donorPhone && !/^[0-9+\-() ]{5,20}$/.test(String(b.donorPhone))) return 'Donor phone is invalid.';
  if (b.batchNo && String(b.batchNo).length > 50) return 'Batch number is too long (max 50).';
  if (b.storageLocationId) {
    if (!isPositiveInt(b.storageLocationId)) return 'Invalid storage location.';
    const r = await pool.query('SELECT 1 FROM blood_storage_locations WHERE id = $1 AND hospital_id = $2', [b.storageLocationId, hospitalId]);
    if (!r.rows[0]) return 'Storage location not found.';
  }
  return null;
}

function withUnitComputed(unit) {
  const now = new Date();
  const expiry = new Date(unit.expiry_date);
  const isExpired = expiry < now;
  const daysToExpiry = Math.ceil((expiry - now) / 86400000);
  return {
    ...unit,
    is_expired: isExpired,
    is_expiring_soon: !isExpired && daysToExpiry <= 5,
    days_to_expiry: daysToExpiry,
    is_issuable: (unit.status === 'Available' || unit.status === 'Reserved') && !isExpired,
  };
}

// ==================== Dashboard ====================

router.get('/dashboard', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;

  const unitsRes = await pool.query(`SELECT * FROM blood_units WHERE hospital_id = $1`, [hospitalId]);
  const units = unitsRes.rows.map(withUnitComputed);

  const today = new Date().toISOString().slice(0, 10);
  const issuedToday = await pool.query(
    `SELECT COUNT(*) FROM blood_issue_records bi JOIN blood_units bu ON bu.id = bi.blood_unit_id WHERE bu.hospital_id = $1 AND bi.issued_on::date = $2`,
    [hospitalId, today]
  );
  const receivedToday = units.filter((u) => new Date(u.received_on).toISOString().slice(0, 10) === today).length;

  const requestsRes = await pool.query(`SELECT * FROM blood_requests WHERE hospital_id = $1`, [hospitalId]);
  const pendingRequests = requestsRes.rows.filter((r) => r.status === 'Pending');
  const emergencyRequests = pendingRequests.filter((r) => ['Emergency', 'Critical'].includes(r.priority));

  const pendingCrossMatch = await pool.query(
    `SELECT COUNT(*) FROM compatibility_tests ct JOIN blood_requests br ON br.id = ct.request_id WHERE br.hospital_id = $1 AND ct.status = 'Pending'`,
    [hospitalId]
  );
  const activeReservations = await pool.query(`SELECT COUNT(*) FROM blood_reservations WHERE hospital_id = $1 AND status = 'Active'`, [hospitalId]);

  const groupDistribution = BLOOD_GROUPS.map((bg) => {
    const groupUnits = units.filter((u) => u.blood_group === bg);
    const available = groupUnits.filter((u) => u.status === 'Available' && !u.is_expired);
    return {
      bloodGroup: bg,
      available: available.length,
      reserved: groupUnits.filter((u) => u.status === 'Reserved').length,
      expiring: groupUnits.filter((u) => u.is_expiring_soon).length,
      isLowStock: available.length < LOW_STOCK_THRESHOLD,
    };
  });

  res.json({
    totalUnits: units.length,
    availableUnits: units.filter((u) => u.status === 'Available' && !u.is_expired).length,
    issuedToday: Number(issuedToday.rows[0].count),
    receivedToday,
    expiringUnits: units.filter((u) => u.is_expiring_soon).length,
    expiredUnits: units.filter((u) => u.is_expired && u.status !== 'Discarded').length,
    emergencyRequests: emergencyRequests.length,
    lowStockGroups: groupDistribution.filter((g) => g.isLowStock).length,
    pendingCrossMatch: Number(pendingCrossMatch.rows[0].count),
    pendingRequests: pendingRequests.length,
    activeReservations: Number(activeReservations.rows[0].count),
    groupDistribution,
  });
});

// ==================== Inventory ====================

router.get('/units', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', bloodGroup = '', componentType = '', status = '' } = req.query;

  const conditions = ['bu.hospital_id = $1', '(bu.unit_number ILIKE $2 OR bu.donor_name ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (bloodGroup) { params.push(bloodGroup); conditions.push(`bu.blood_group = $${params.length}`); }
  if (componentType) { params.push(componentType); conditions.push(`bu.component_type = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`bu.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT bu.*, sl.name AS storage_location_name FROM blood_units bu
     LEFT JOIN blood_storage_locations sl ON sl.id = bu.storage_location_id
     WHERE ${conditions.join(' AND ')} ORDER BY bu.received_on DESC`,
    params
  );
  const units = result.rows.map(withUnitComputed);

  res.json({
    units,
    stats: {
      total: units.length,
      available: units.filter((u) => u.status === 'Available' && !u.is_expired).length,
      expiring: units.filter((u) => u.is_expiring_soon).length,
      expired: units.filter((u) => u.is_expired).length,
    },
    bloodGroups: BLOOD_GROUPS, componentTypes: COMPONENT_TYPES,
  });
});

router.get('/units/scan/:code', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { code } = req.params;
  const result = await pool.query(`SELECT * FROM blood_units WHERE hospital_id = $1 AND UPPER(unit_number) = UPPER($2)`, [hospitalId, code]);
  if (!result.rows[0]) return res.status(404).json({ message: 'No blood unit found with that barcode.' });
  res.json(withUnitComputed(result.rows[0]));
});

router.get('/units/:id', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT bu.*, sl.name AS storage_location_name FROM blood_units bu LEFT JOIN blood_storage_locations sl ON sl.id = bu.storage_location_id
     WHERE bu.id = $1 AND bu.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Blood unit not found.' });
  res.json(withUnitComputed(result.rows[0]));
});

router.post('/units', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  const unitError = await validateUnitBody(b, hospitalId);
  if (unitError) return res.status(400).json({ message: unitError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const unitNumber = await generateUnitNumber(client);
    const result = await client.query(
      `INSERT INTO blood_units (hospital_id, unit_number, blood_group, component_type, batch_no, collected_on, expiry_date,
         donor_name, donor_phone, is_voluntary_donor, storage_location_id, volume_ml, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        hospitalId, unitNumber, b.bloodGroup, b.componentType || 'Whole Blood', b.batchNo, b.collectedOn, b.expiryDate,
        b.donorName, b.donorPhone, b.isVoluntaryDonor ?? true, b.storageLocationId || null, b.volumeMl || 350, name,
      ]
    );
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Receive Blood Unit', module: 'Blood Bank', details: unitNumber, ip: req.ip });
    res.status(201).json(withUnitComputed(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/units/:id', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;
  const unitError = await validateUnitBody(b, hospitalId);
  if (unitError) return res.status(400).json({ message: unitError });

  // unit_number is immutable once set, matches the original exactly. Issued units are locked (traceability).
  const result = await pool.query(
    `UPDATE blood_units SET blood_group=$1, component_type=$2, batch_no=$3, collected_on=$4, expiry_date=$5,
       donor_name=$6, donor_phone=$7, is_voluntary_donor=$8, storage_location_id=$9, volume_ml=$10
     WHERE id=$11 AND hospital_id=$12 AND status <> 'Issued' RETURNING *`,
    [b.bloodGroup, b.componentType || 'Whole Blood', b.batchNo, b.collectedOn, b.expiryDate, b.donorName, b.donorPhone, b.isVoluntaryDonor ?? true, b.storageLocationId || null, b.volumeMl || 350, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Blood unit not found, or it is already issued and cannot be edited.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Blood Unit', module: 'Blood Bank', details: result.rows[0].unit_number, ip: req.ip });
  res.json(withUnitComputed(result.rows[0]));
});

router.delete('/units/:id', requirePermission('bloodbank.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  let result;
  try {
    result = await pool.query(`DELETE FROM blood_units WHERE id = $1 AND hospital_id = $2 AND status IN ('Available','Quarantined','Discarded') AND NOT EXISTS (SELECT 1 FROM compatibility_tests WHERE blood_unit_id = blood_units.id) RETURNING unit_number`, [id, hospitalId]);
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ message: 'This unit has linked records and cannot be deleted. Discard it instead.' });
    throw e;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Blood unit not found, or it is in use (reserved/issued or has a cross-match). Discard it instead.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Blood Unit', module: 'Blood Bank', details: result.rows[0].unit_number, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Blood unit deleted.' });
});

router.patch('/units/:id/quarantine', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !String(reason).trim() || String(reason).length > 500) return res.status(400).json({ message: 'A reason is required (max 500 characters).' });
  const result = await pool.query(`UPDATE blood_units SET status='Quarantined', status_reason=$1 WHERE id=$2 AND hospital_id=$3 AND status <> 'Issued' RETURNING *`, [reason, id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Blood unit not found, or it is currently issued.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Quarantine Blood Unit', module: 'Blood Bank', details: `${result.rows[0].unit_number}: ${reason}`, severity: 'Warning', ip: req.ip });
  res.json(withUnitComputed(result.rows[0]));
});

router.patch('/units/:id/discard', requirePermission('bloodbank.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !String(reason).trim() || String(reason).length > 500) return res.status(400).json({ message: 'A reason is required (max 500 characters).' });
  const result = await pool.query(`UPDATE blood_units SET status='Discarded', status_reason=$1 WHERE id=$2 AND hospital_id=$3 AND status <> 'Issued' RETURNING *`, [reason, id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Blood unit not found, or it is currently issued.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Discard Blood Unit', module: 'Blood Bank', details: `${result.rows[0].unit_number}: ${reason}`, severity: 'Warning', ip: req.ip });
  res.json(withUnitComputed(result.rows[0]));
});

// GET /api/blood-bank/components?componentType= - breakdown per component
router.get('/components', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { componentType = '' } = req.query;

  const result = await pool.query(`SELECT * FROM blood_units WHERE hospital_id = $1`, [hospitalId]);
  const units = result.rows.map(withUnitComputed);

  const types = componentType ? [componentType] : COMPONENT_TYPES;
  const breakdown = types.map((type) => {
    const typeUnits = units.filter((u) => u.component_type === type);
    return {
      componentType: type,
      available: typeUnits.filter((u) => u.status === 'Available' && !u.is_expired).length,
      reserved: typeUnits.filter((u) => u.status === 'Reserved').length,
      issued: typeUnits.filter((u) => u.status === 'Issued').length,
      expiring: typeUnits.filter((u) => u.is_expiring_soon).length,
    };
  });

  res.json({ breakdown });
});

// ==================== Requests ====================

router.get('/requests', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '', priority = '' } = req.query;

  const conditions = ['br.hospital_id = $1'];
  const params = [hospitalId];
  if (status) { params.push(status); conditions.push(`br.status = $${params.length}`); }
  if (priority) { params.push(priority); conditions.push(`br.priority = $${params.length}`); }

  const result = await pool.query(
    `SELECT br.*, p.full_name AS patient_name, p.uhid AS patient_uhid, d.full_name AS doctor_name, dep.name AS department_name
     FROM blood_requests br
     JOIN patients p ON p.id = br.patient_id
     LEFT JOIN doctors d ON d.id = br.requested_by_doctor_id
     LEFT JOIN departments dep ON dep.id = br.department_id
     WHERE ${conditions.join(' AND ')} ORDER BY br.requested_on DESC`,
    params
  );

  res.json({
    requests: result.rows,
    stats: {
      pending: result.rows.filter((r) => r.status === 'Pending').length,
      approved: result.rows.filter((r) => r.status === 'Approved').length,
      emergencyPending: result.rows.filter((r) => r.status === 'Pending' && ['Emergency', 'Critical'].includes(r.priority)).length,
    },
    priorities: REQUEST_PRIORITIES,
  });
});

router.get('/requests/:id', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const reqRes = await pool.query(
    `SELECT br.*, p.full_name AS patient_name, p.uhid AS patient_uhid, d.full_name AS doctor_name, dep.name AS department_name
     FROM blood_requests br JOIN patients p ON p.id = br.patient_id
     LEFT JOIN doctors d ON d.id = br.requested_by_doctor_id LEFT JOIN departments dep ON dep.id = br.department_id
     WHERE br.id = $1 AND br.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!reqRes.rows[0]) return res.status(404).json({ message: 'Blood request not found.' });
  const request = reqRes.rows[0];

  const crossMatchesRes = await pool.query(
    `SELECT ct.*, bu.unit_number FROM compatibility_tests ct JOIN blood_units bu ON bu.id = ct.blood_unit_id WHERE ct.request_id = $1`,
    [id]
  );
  const issueRecordsRes = await pool.query(
    `SELECT bi.*, bu.unit_number FROM blood_issue_records bi JOIN blood_units bu ON bu.id = bi.blood_unit_id WHERE bi.request_id = $1`,
    [id]
  );
  const candidateUnitsRes = await pool.query(
    `SELECT * FROM blood_units WHERE hospital_id = $1 AND blood_group = $2 AND component_type = $3 AND status = 'Available'`,
    [hospitalId, request.blood_group, request.component_type]
  );

  res.json({
    request,
    compatibilityTests: crossMatchesRes.rows,
    issueRecords: issueRecordsRes.rows,
    candidateUnits: candidateUnitsRes.rows.map(withUnitComputed),
  });
});

router.post('/requests', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!isPositiveInt(b.patientId)) return res.status(400).json({ message: 'Patient is required.' });
  if (!isPositiveInt(b.unitsRequested) || Number(b.unitsRequested) > 100) return res.status(400).json({ message: 'Units requested must be a whole number from 1 to 100.' });
  if (!BLOOD_GROUPS.includes(b.bloodGroup)) return res.status(400).json({ message: 'Invalid blood group.' });
  if (b.componentType && !COMPONENT_TYPES.includes(b.componentType)) return res.status(400).json({ message: 'Invalid component type.' });
  if (b.priority && !REQUEST_PRIORITIES.includes(b.priority)) return res.status(400).json({ message: 'Invalid priority.' });
  if (b.reasonForRequest && String(b.reasonForRequest).length > 500) return res.status(400).json({ message: 'Reason is too long (max 500).' });
  if ((b.requestedByDoctorId && !isPositiveInt(b.requestedByDoctorId)) || (b.departmentId && !isPositiveInt(b.departmentId))) return res.status(400).json({ message: 'Invalid doctor or department.' });
  {
    const [p, d, dep] = await Promise.all([
      pool.query('SELECT 1 FROM patients WHERE id = $1 AND hospital_id = $2', [b.patientId, hospitalId]),
      b.requestedByDoctorId ? pool.query('SELECT 1 FROM doctors WHERE id = $1 AND hospital_id = $2', [b.requestedByDoctorId, hospitalId]) : Promise.resolve({ rows: [1] }),
      b.departmentId ? pool.query('SELECT 1 FROM departments WHERE id = $1 AND hospital_id = $2', [b.departmentId, hospitalId]) : Promise.resolve({ rows: [1] }),
    ]);
    if (!p.rows[0] || !d.rows[0] || !dep.rows[0]) return res.status(404).json({ message: 'Patient, doctor or department not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestNumber = await generateRequestNumber(client);
    const result = await client.query(
      `INSERT INTO blood_requests (hospital_id, request_number, patient_id, blood_group, component_type, units_requested,
         priority, requested_by_doctor_id, department_id, reason_for_request, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        hospitalId, requestNumber, b.patientId, b.bloodGroup, b.componentType || 'Whole Blood', b.unitsRequested,
        b.priority || 'Normal', b.requestedByDoctorId || null, b.departmentId || null, b.reasonForRequest, name,
      ]
    );
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Raise Blood Request', module: 'Blood Bank', details: `${requestNumber} (${b.priority || 'Normal'})`, severity: ['Emergency', 'Critical'].includes(b.priority) ? 'Critical' : 'Info', ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/requests/:id/approve', requirePermission('bloodbank.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE blood_requests SET status='Approved', approved_by=$1, approved_on=NOW() WHERE id=$2 AND hospital_id=$3 AND status='Pending' RETURNING *`,
    [name, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(400).json({ message: 'Only a Pending request can be approved.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Approve Blood Request', module: 'Blood Bank', details: result.rows[0].request_number, ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/requests/:id/reject', requirePermission('bloodbank.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !String(reason).trim() || String(reason).length > 500) return res.status(400).json({ message: 'A rejection reason is required (max 500 characters).' });
  const result = await pool.query(
    `UPDATE blood_requests SET status='Rejected', rejection_reason=$1 WHERE id=$2 AND hospital_id=$3 AND status='Pending' RETURNING *`,
    [reason, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(400).json({ message: 'Only a Pending request can be rejected.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Reject Blood Request', module: 'Blood Bank', details: `${result.rows[0].request_number}: ${reason}`, ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/requests/:id/cancel', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE blood_requests SET status='Cancelled' WHERE id=$1 AND hospital_id=$2 AND status NOT IN ('Fulfilled','Cancelled') RETURNING *`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(400).json({ message: 'This request cannot be cancelled.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Blood Request', module: 'Blood Bank', details: result.rows[0].request_number, ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Cross-Match ====================

router.get('/cross-match', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '' } = req.query;

  const conditions = ['br.hospital_id = $1'];
  const params = [hospitalId];
  if (status) { params.push(status); conditions.push(`ct.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT ct.*, bu.unit_number, br.request_number, br.blood_group AS request_blood_group, p.full_name AS patient_name
     FROM compatibility_tests ct
     JOIN blood_requests br ON br.id = ct.request_id
     JOIN blood_units bu ON bu.id = ct.blood_unit_id
     JOIN patients p ON p.id = br.patient_id
     WHERE ${conditions.join(' AND ')} ORDER BY ct.tested_on DESC NULLS FIRST`,
    params
  );

  const pendingCount = await pool.query(
    `SELECT COUNT(*) FROM compatibility_tests ct JOIN blood_requests br ON br.id = ct.request_id WHERE br.hospital_id = $1 AND ct.status = 'Pending'`,
    [hospitalId]
  );

  res.json({ crossMatches: result.rows, pendingCount: Number(pendingCount.rows[0].count) });
});

// GET /api/blood-bank/cross-match/:id/report-file - the uploaded lab report, for this hospital's users only.
router.get('/cross-match/:id/report-file', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'Report not found.' });
  const result = await pool.query(
    `SELECT ct.lab_report_file_path FROM compatibility_tests ct JOIN blood_requests br ON br.id = ct.request_id
     WHERE ct.id = $1 AND br.hospital_id = $2`,
    [req.params.id, hospitalId]
  );
  const stored = result.rows[0]?.lab_report_file_path;
  if (!stored) return res.status(404).json({ message: 'No report file for this cross-match.' });

  const base = path.resolve(crossMatchUploadDir);
  const resolved = path.resolve(base, path.basename(stored)); // basename: the stored value is a bare file name
  if (path.dirname(resolved) !== base || !fs.existsSync(resolved)) return res.status(404).json({ message: 'Report file not found.' });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved)}"`);
  return res.sendFile(resolved);
});

router.post('/cross-match', requirePermission('bloodbank.create'), crossMatchUpload.single('labReportFile'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { requestId, bloodUnitId, bloodGroupVerified, rhFactorVerified, crossMatchResult, remarks } = req.body;
  let saved = false; // set once the row is committed; otherwise the uploaded file is removed again below

  if (!/^\d+$/.test(String(requestId || '')) || !/^\d+$/.test(String(bloodUnitId || ''))) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ message: 'Select a blood request and a blood unit.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestRes = await client.query(`SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2`, [requestId, hospitalId]);
    if (!requestRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Blood request not found.' });
    }

    const unitRes = await client.query(`SELECT * FROM blood_units WHERE id = $1 AND hospital_id = $2 AND status = 'Available'`, [bloodUnitId, hospitalId]);
    if (!unitRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Selected blood unit is not available.' });
    }

    // Recompute result: only "Compatible" if both boxes are checked AND the poster claimed Compatible - matches the original's collapse logic.
    const bgVerified = bloodGroupVerified === 'true' || bloodGroupVerified === true;
    const rhVerified = rhFactorVerified === 'true' || rhFactorVerified === true;
    const finalResult = bgVerified && rhVerified && crossMatchResult === 'Compatible' ? 'Compatible' : (crossMatchResult === 'Incompatible' ? 'Incompatible' : 'Pending');

    const result = await client.query(
      `INSERT INTO compatibility_tests (request_id, blood_unit_id, blood_group_verified, rh_factor_verified, cross_match_result, tested_by, tested_on, lab_report_file_name, lab_report_file_path, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9) RETURNING *`,
      [requestId, bloodUnitId, bgVerified, rhVerified, finalResult, name, req.file?.originalname || null, req.file?.filename || null, remarks]
    );

    await client.query(`UPDATE blood_units SET status = 'Reserved' WHERE id = $1`, [bloodUnitId]);
    await client.query('COMMIT');
    saved = true;

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cross-Match Created', module: 'Blood Bank', details: `Unit ${unitRes.rows[0].unit_number} for ${requestRes.rows[0].request_number}: ${finalResult}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    // The file is written by multer before this handler runs; if the request was rejected (or failed), do not keep it.
    if (!saved && req.file) fs.rmSync(req.file.path, { force: true });
  }
});

router.post('/cross-match/:id/approve', requirePermission('bloodbank.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Cross-match not found.' });

  const result = await pool.query(
    `UPDATE compatibility_tests ct SET status='Approved', approved_by=$1, approved_on=NOW()
     WHERE ct.id=$2 AND ct.status='Pending'
       AND EXISTS (SELECT 1 FROM blood_requests br WHERE br.id = ct.request_id AND br.hospital_id = $3)
     RETURNING ct.*`,
    [name, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(400).json({ message: 'Only a Pending cross-match can be approved.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Approve Cross-Match', module: 'Blood Bank', details: `Cross-match #${id}`, ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/cross-match/:id/reject', requirePermission('bloodbank.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Cross-match not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE compatibility_tests ct SET status='Rejected'
       WHERE ct.id=$1 AND ct.status='Pending'
         AND EXISTS (SELECT 1 FROM blood_requests br WHERE br.id = ct.request_id AND br.hospital_id = $2)
       RETURNING ct.*`,
      [id, hospitalId]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only a Pending cross-match can be rejected.' });
    }

    // Release the unit back to Available if it was Reserved for this cross-match.
    await client.query(`UPDATE blood_units SET status = 'Available' WHERE id = $1 AND status = 'Reserved'`, [result.rows[0].blood_unit_id]);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Reject Cross-Match', module: 'Blood Bank', details: `Cross-match #${id}`, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Issue ====================

router.get('/issue-history', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { patientId = '' } = req.query;

  const conditions = ['p.hospital_id = $1'];
  const params = [hospitalId];
  if (patientId) {
    if (!isPositiveInt(patientId)) return res.status(400).json({ message: 'Invalid patient.' });
    params.push(patientId); conditions.push(`bi.patient_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT bi.*, bu.unit_number, bu.blood_group, bu.component_type, br.request_number, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM blood_issue_records bi
     JOIN blood_units bu ON bu.id = bi.blood_unit_id
     JOIN blood_requests br ON br.id = bi.request_id
     JOIN patients p ON p.id = bi.patient_id
     WHERE ${conditions.join(' AND ')} ORDER BY bi.issued_on DESC`,
    params
  );
  res.json({ issues: result.rows });
});

router.post('/issue', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { requestId, bloodUnitId, issuedToWard, receivedByStaff } = req.body;
  if (!isPositiveInt(requestId) || !isPositiveInt(bloodUnitId)) return res.status(400).json({ message: 'Select a blood request and a blood unit.' });
  if ((issuedToWard && String(issuedToWard).length > 100) || (receivedByStaff && String(receivedByStaff).length > 100)) {
    return res.status(400).json({ message: 'Ward / receiver name is too long.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row locks: two concurrent issues of the same unit/request must not both succeed.
    const requestRes = await client.query(`SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2 AND status = 'Approved' FOR UPDATE`, [requestId, hospitalId]);
    const unitRes = await client.query(`SELECT * FROM blood_units WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [bloodUnitId, hospitalId]);
    const crossMatchRes = await client.query(
      `SELECT * FROM compatibility_tests WHERE request_id = $1 AND blood_unit_id = $2 AND status = 'Approved' AND cross_match_result = 'Compatible'`,
      [requestId, bloodUnitId]
    );

    const request = requestRes.rows[0];
    const unit = unitRes.rows[0];
    const isPassed = crossMatchRes.rows.length > 0;
    const unitIssuable = unit && (unit.status === 'Available' || unit.status === 'Reserved') && new Date(unit.expiry_date) >= new Date();

    if (!request || !isPassed || !unitIssuable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cannot issue: verify the request is Approved, the cross-match is Approved & Compatible, and the unit is available and unexpired.' });
    }

    const issueSlipNumber = await generateIssueSlipNumber(client);
    const issueRes = await client.query(
      `INSERT INTO blood_issue_records (issue_slip_number, request_id, blood_unit_id, patient_id, issued_by, issued_to_ward, received_by_staff)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [issueSlipNumber, requestId, bloodUnitId, request.patient_id, name, issuedToWard, receivedByStaff]
    );

    await client.query(`UPDATE blood_units SET status = 'Issued' WHERE id = $1`, [bloodUnitId]);
    await client.query(`UPDATE blood_requests SET status = 'Fulfilled' WHERE id = $1`, [requestId]);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Issue Blood', module: 'Blood Bank', details: `${issueSlipNumber}: unit ${unit.unit_number} for ${request.request_number}`, ip: req.ip });
    res.status(201).json(issueRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/issue/:id/slip', requirePermission('bloodbank.print'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT bi.*, bu.unit_number, bu.blood_group, bu.component_type, br.request_number, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM blood_issue_records bi
     JOIN blood_units bu ON bu.id = bi.blood_unit_id
     JOIN blood_requests br ON br.id = bi.request_id
     JOIN patients p ON p.id = bi.patient_id
     WHERE bi.id = $1 AND p.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Issue record not found.' });
  res.json(result.rows[0]);
});

// ==================== Return ====================

router.get('/returns', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;

  const issued = await pool.query(
    `SELECT bi.*, bu.unit_number, bu.blood_group, bu.component_type, p.full_name AS patient_name
     FROM blood_issue_records bi JOIN blood_units bu ON bu.id = bi.blood_unit_id JOIN patients p ON p.id = bi.patient_id
     WHERE bu.hospital_id = $1 AND bu.status = 'Issued'`,
    [hospitalId]
  );
  const history = await pool.query(
    `SELECT br.*, bu.unit_number FROM blood_return_records br JOIN blood_units bu ON bu.id = br.blood_unit_id
     WHERE bu.hospital_id = $1 ORDER BY br.returned_on DESC`,
    [hospitalId]
  );

  res.json({ issuedUnits: issued.rows, returnHistory: history.rows });
});

router.post('/returns', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { issueRecordId, returnReason, temperatureAtReturnC, qualityCheckPassed, qualityCheckNotes } = req.body;
  if (!isPositiveInt(issueRecordId)) return res.status(400).json({ message: 'Select an issue record.' });
  if (temperatureAtReturnC !== undefined && temperatureAtReturnC !== null && temperatureAtReturnC !== ''
    && !(Number.isFinite(Number(temperatureAtReturnC)) && Number(temperatureAtReturnC) >= -100 && Number(temperatureAtReturnC) <= 100)) {
    return res.status(400).json({ message: 'Temperature must be a number between -100 and 100.' });
  }
  if ((returnReason && String(returnReason).length > 500) || (qualityCheckNotes && String(qualityCheckNotes).length > 500)) {
    return res.status(400).json({ message: 'Reason / notes are too long (max 500).' });
  }
  const tempValue = temperatureAtReturnC === '' || temperatureAtReturnC === undefined ? null : temperatureAtReturnC;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scoped to this hospital via the unit; locks the unit so a unit cannot be returned twice concurrently.
    const issueRes = await client.query(
      `SELECT bi.*, bu.expiry_date, bu.status AS unit_status
       FROM blood_issue_records bi JOIN blood_units bu ON bu.id = bi.blood_unit_id
       WHERE bi.id = $1 AND bu.hospital_id = $2 FOR UPDATE OF bu`,
      [issueRecordId, hospitalId]
    );
    const issue = issueRes.rows[0];
    if (!issue) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Issue record not found.' });
    }
    if (issue.unit_status !== 'Issued') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This unit is not currently issued (already returned?).' });
    }

    const passed = qualityCheckPassed === true || qualityCheckPassed === 'true';
    const expired = new Date(issue.expiry_date) < new Date();
    const outcome = passed && !expired ? 'Restocked' : 'Rejected';
    const newStatus = outcome === 'Restocked' ? 'Available' : 'Discarded';
    const statusReason = outcome === 'Rejected' ? (expired ? 'Expired at the time of return' : qualityCheckNotes || 'Failed quality check on return') : null;

    const result = await client.query(
      `INSERT INTO blood_return_records (issue_record_id, blood_unit_id, return_reason, temperature_at_return_c, quality_check_passed, quality_check_notes, outcome, returned_by, checked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [issueRecordId, issue.blood_unit_id, returnReason, tempValue, passed, qualityCheckNotes, outcome, name, name]
    );

    await client.query(`UPDATE blood_units SET status = $1, status_reason = $2 WHERE id = $3`, [newStatus, statusReason, issue.blood_unit_id]);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Return Blood Unit', module: 'Blood Bank', details: `Outcome: ${outcome}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Reservations ====================

router.get('/reservations', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '' } = req.query;

  const conditions = ['br.hospital_id = $1'];
  const params = [hospitalId];
  if (status) { params.push(status); conditions.push(`br.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT br.*, bu.unit_number, p.full_name AS patient_name FROM blood_reservations br
     LEFT JOIN blood_units bu ON bu.id = br.blood_unit_id
     LEFT JOIN patients p ON p.id = br.patient_id
     WHERE ${conditions.join(' AND ')} ORDER BY br.reserved_on DESC`,
    params
  );
  res.json({ reservations: result.rows, reservationTypes: RESERVATION_TYPES });
});

router.post('/reservations', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  const units = b.unitsReserved === undefined || b.unitsReserved === '' ? 1 : b.unitsReserved;
  if (!BLOOD_GROUPS.includes(b.bloodGroup)) return res.status(400).json({ message: 'Select a valid blood group.' });
  if (b.componentType && !COMPONENT_TYPES.includes(b.componentType)) return res.status(400).json({ message: 'Invalid component type.' });
  if (b.reservationType && !RESERVATION_TYPES.includes(b.reservationType)) return res.status(400).json({ message: 'Invalid reservation type.' });
  if (!isPositiveInt(units) || Number(units) > 100) return res.status(400).json({ message: 'Units reserved must be a whole number from 1 to 100.' });
  if (b.bloodUnitId && !isPositiveInt(b.bloodUnitId)) return res.status(400).json({ message: 'Invalid blood unit.' });
  if (b.patientId && !isPositiveInt(b.patientId)) return res.status(400).json({ message: 'Invalid patient.' });
  if (b.requiredByDate && !isDateString(String(b.requiredByDate))) return res.status(400).json({ message: 'Invalid required-by date.' });
  if (b.notes && String(b.notes).length > 500) return res.status(400).json({ message: 'Notes are too long (max 500).' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (b.patientId) {
      const pr = await client.query(`SELECT 1 FROM patients WHERE id = $1 AND hospital_id = $2`, [b.patientId, hospitalId]);
      if (!pr.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Patient not found.' });
      }
    }

    if (b.bloodUnitId) {
      const unitRes = await client.query(`SELECT * FROM blood_units WHERE id = $1 AND hospital_id = $2 AND status = 'Available' FOR UPDATE`, [b.bloodUnitId, hospitalId]);
      if (!unitRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Selected blood unit is not available.' });
      }
      await client.query(`UPDATE blood_units SET status = 'Reserved' WHERE id = $1`, [b.bloodUnitId]);
    }

    const reservationNumber = await generateReservationNumber(client);
    const result = await client.query(
      `INSERT INTO blood_reservations (hospital_id, reservation_number, blood_unit_id, blood_group, component_type, units_reserved, patient_id, reservation_type, required_by_date, reserved_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [hospitalId, reservationNumber, b.bloodUnitId || null, b.bloodGroup, b.componentType || 'Whole Blood', Number(units), b.patientId || null, b.reservationType || 'Surgery', b.requiredByDate || null, name, b.notes]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Blood Reservation', module: 'Blood Bank', details: reservationNumber, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/reservations/:id/fulfill', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE blood_reservations SET status='Fulfilled' WHERE id=$1 AND hospital_id=$2 AND status='Active' RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(400).json({ message: 'Only an Active reservation can be fulfilled.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Fulfill Blood Reservation', module: 'Blood Bank', details: result.rows[0].reservation_number, ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/reservations/:id/cancel', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE blood_reservations SET status='Cancelled', cancelled_reason=$1 WHERE id=$2 AND hospital_id=$3 AND status='Active' RETURNING *`, [reason, id, hospitalId]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only an Active reservation can be cancelled.' });
    }
    if (result.rows[0].blood_unit_id) {
      await client.query(`UPDATE blood_units SET status = 'Available' WHERE id = $1 AND status = 'Reserved'`, [result.rows[0].blood_unit_id]);
    }
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Blood Reservation', module: 'Blood Bank', details: result.rows[0].reservation_number, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ==================== Storage ====================

router.get('/storage', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM blood_storage_locations WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]);
  const withOutOfRange = result.rows.map((loc) => ({
    ...loc,
    is_out_of_range: Number(loc.current_temperature_c) < Number(loc.min_temperature_c) || Number(loc.current_temperature_c) > Number(loc.max_temperature_c),
  }));
  res.json({ locations: withOutOfRange });
});

router.post('/storage', requirePermission('bloodbank.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name, equipmentType, rackNumber, shelfNumber, minTemperatureC, maxTemperatureC, capacity } = req.body;
  if (!name || !String(name).trim() || String(name).length > 100) return res.status(400).json({ message: 'Name is required (max 100 characters).' });
  if ((equipmentType && String(equipmentType).length > 50) || (rackNumber && String(rackNumber).length > 50) || (shelfNumber && String(shelfNumber).length > 50)) {
    return res.status(400).json({ message: 'Equipment / rack / shelf value is too long (max 50).' });
  }
  const has = (v) => v !== undefined && v !== null && v !== '';
  const minT = has(minTemperatureC) ? Number(minTemperatureC) : 2;
  const maxT = has(maxTemperatureC) ? Number(maxTemperatureC) : 6;
  const cap = has(capacity) ? capacity : 50;
  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || minT < -100 || maxT > 100 || minT >= maxT) {
    return res.status(400).json({ message: 'Temperature range is invalid (min must be lower than max, within -100 to 100).' });
  }
  if (!isPositiveInt(cap) || Number(cap) > 100000) return res.status(400).json({ message: 'Capacity must be a whole number greater than 0.' });

  const result = await pool.query(
    `INSERT INTO blood_storage_locations (hospital_id, name, equipment_type, rack_number, shelf_number, min_temperature_c, max_temperature_c, capacity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [hospitalId, String(name).trim(), equipmentType || 'Refrigerator', rackNumber, shelfNumber, minT, maxT, Number(cap)]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/storage/:id', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const locRes = await pool.query(`SELECT * FROM blood_storage_locations WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!locRes.rows[0]) return res.status(404).json({ message: 'Storage location not found.' });

  const unitsRes = await pool.query(`SELECT * FROM blood_units WHERE storage_location_id = $1`, [id]);
  const logsRes = await pool.query(`SELECT * FROM blood_storage_temperature_logs WHERE storage_location_id = $1 ORDER BY recorded_on DESC LIMIT 50`, [id]);

  res.json({ location: locRes.rows[0], units: unitsRes.rows.map(withUnitComputed), temperatureLogs: logsRes.rows });
});

router.post('/storage/:id/temperature', requirePermission('bloodbank.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { temperatureC } = req.body;
  if (!isPositiveInt(id)) return res.status(404).json({ message: 'Storage location not found.' });
  if (temperatureC === undefined || temperatureC === null || temperatureC === '' || !Number.isFinite(Number(temperatureC)) || Number(temperatureC) < -100 || Number(temperatureC) > 100) {
    return res.status(400).json({ message: 'Temperature must be a number between -100 and 100.' });
  }

  const locRes = await pool.query(`SELECT * FROM blood_storage_locations WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  const location = locRes.rows[0];
  if (!location) return res.status(404).json({ message: 'Storage location not found.' });

  const outOfRange = Number(temperatureC) < Number(location.min_temperature_c) || Number(temperatureC) > Number(location.max_temperature_c);

  await pool.query(`UPDATE blood_storage_locations SET current_temperature_c = $1, last_checked_on = NOW() WHERE id = $2`, [temperatureC, id]);
  await pool.query(
    `INSERT INTO blood_storage_temperature_logs (storage_location_id, temperature_c, recorded_by, was_out_of_range) VALUES ($1,$2,$3,$4)`,
    [id, temperatureC, name, outOfRange]
  );

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Record Storage Temperature', module: 'Blood Bank', details: `${location.name}: ${temperatureC}°C${outOfRange ? ' (OUT OF RANGE)' : ''}`, severity: outOfRange ? 'Warning' : 'Info', ip: req.ip });
  res.json({ message: 'Temperature recorded.', outOfRange });
});

router.delete('/storage/:id', requirePermission('bloodbank.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM blood_storage_locations WHERE id = $1 AND hospital_id = $2 RETURNING id`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Storage location not found.' });
  res.json({ message: 'Storage location deleted.' });
});

// ==================== Patient History ====================

router.get('/patient-history/:patientId', requirePermission('bloodbank.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { patientId } = req.params;
  if (!isPositiveInt(patientId)) return res.status(404).json({ message: 'Patient not found.' });

  const requests = await pool.query(`SELECT * FROM blood_requests WHERE patient_id = $1 AND hospital_id = $2 ORDER BY requested_on DESC`, [patientId, hospitalId]);
  const issues = await pool.query(
    `SELECT bi.*, bu.unit_number, bu.blood_group, bu.component_type FROM blood_issue_records bi JOIN blood_units bu ON bu.id = bi.blood_unit_id WHERE bi.patient_id = $1 AND bu.hospital_id = $2`,
    [patientId, hospitalId]
  );

  res.json({ requests: requests.rows, issues: issues.rows });
});

module.exports = router;
