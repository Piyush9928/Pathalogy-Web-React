const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const EMPLOYEE_TYPES = ['Permanent', 'On Contract', 'Probation'];
const CURRENT_STATUSES = ['Active', 'On Leave', 'Resigned', 'Terminated'];
const MODES_OF_PAYMENT = ['Bank Transfer', 'Cash', 'Cheque'];
const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected'];
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half Day', 'On Leave'];

async function generateEmployeeCode(client, hospitalId) {
  const seqRes = await client.query(`SELECT nextval('employee_code_seq') AS seq`);
  return `EMP-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

// Returns a message when the mapped employee is invalid, otherwise null.
async function validateEmployee(e, hospitalId) {
  if (!e.fullName || !String(e.fullName).trim()) return 'Full name is required.';
  if (String(e.fullName).length > 150) return 'Full name must be 150 characters or fewer.';
  if (!EMPLOYEE_TYPES.includes(e.employeeType)) return 'Invalid employee type.';
  if (!CURRENT_STATUSES.includes(e.currentStatus)) return 'Invalid status.';
  if (!MODES_OF_PAYMENT.includes(e.modeOfPayment)) return 'Invalid mode of payment.';
  if (!isMoney(e.monthlySalary)) return 'Monthly salary must be 0 or more.';
  if (e.email && !/^\S+@\S+\.\S+$/.test(e.email)) return 'Enter a valid email.';
  for (const [label, v] of [['Date of birth', e.dateOfBirth], ['Joining date', e.joiningDate]]) {
    if (v && Number.isNaN(Date.parse(v))) return `${label} is not a valid date.`;
  }
  const checks = [
    ['designation_masters', e.designationId], ['branches', e.branchId], ['users', e.linkedUserId],
  ];
  for (const [table, id] of checks) {
    if (!(await idsBelongToHospital(pool, table, hospitalId, [id]))) return 'A selected designation, branch or user was not found.';
  }
  return null;
}

function mapEmployeeBody(body) {
  return {
    fullName: body.fullName, gender: body.gender || 'Male', dateOfBirth: body.dateOfBirth || null,
    fatherName: body.fatherName || null, motherName: body.motherName || null, spouseName: body.spouseName || null,
    maritalStatus: body.maritalStatus || 'Single', bloodGroup: body.bloodGroup || null,
    email: body.email || null, contactNo1: body.contactNo1 || null, contactNo2: body.contactNo2 || null,
    temporaryAddress: body.temporaryAddress || null, permanentAddress: body.permanentAddress || null,
    aadhaarNo: body.aadhaarNo || null, panNo: body.panNo || null,
    joiningDate: body.joiningDate || new Date(), designationId: body.designationId || null,
    department: body.department || null, branchId: body.branchId || null,
    employeeType: body.employeeType || 'Permanent', currentStatus: body.currentStatus || 'Active',
    bankName: body.bankName || null, bankAccountNo: body.bankAccountNo || null, bankIfsc: body.bankIfsc || null,
    isPf: body.isPf ?? false, pfNumber: body.pfNumber || null, isEsi: body.isEsi ?? false, esiNumber: body.esiNumber || null,
    monthlySalary: body.monthlySalary ?? 0, modeOfPayment: body.modeOfPayment || 'Bank Transfer',
    linkedUserId: body.linkedUserId || null, workingHours: body.workingHours || null, dutyShift: body.dutyShift || null,
    employeeGroup: body.employeeGroup || null, biometricCode: body.biometricCode || null,
    guardianRelation: body.guardianRelation || null, remark: body.remark || null, photoUrl: body.photoUrl || null,
  };
}

// ==================== Designations ====================

router.get('/designations', requirePermission('hr.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM designation_masters WHERE hospital_id = $1 ORDER BY name ASC`, [hospitalId]);
  res.json({ designations: result.rows });
});

router.post('/designations', requirePermission('hr.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Designation name is required.' });
  try {
    const result = await pool.query(`INSERT INTO designation_masters (hospital_id, name) VALUES ($1,$2) RETURNING *`, [hospitalId, name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Designation already exists.' });
    throw err;
  }
});

router.delete('/designations/:id', requirePermission('hr.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const inUse = await pool.query(`SELECT 1 FROM employees WHERE designation_id = $1 LIMIT 1`, [id]);
  if (inUse.rows[0]) return res.status(409).json({ message: 'Cannot delete a designation assigned to employees.' });

  const result = await pool.query(`DELETE FROM designation_masters WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Designation not found.' });
  res.json({ message: 'Designation deleted.' });
});

// ==================== Employees ====================

// GET /api/employees?search=&status=&designationId=
router.get('/', requirePermission('hr.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status = '', designationId = '' } = req.query;

  const conditions = ['e.hospital_id = $1', '(e.full_name ILIKE $2 OR e.employee_code ILIKE $2 OR e.contact_no_1 ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (status) { params.push(status); conditions.push(`e.current_status = $${params.length}`); }
  if (designationId) { params.push(designationId); conditions.push(`e.designation_id = $${params.length}`); }

  const result = await pool.query(
    `SELECT e.*, d.name AS designation_name, b.name AS branch_name, u.full_name AS linked_user_name
     FROM employees e
     LEFT JOIN designation_masters d ON d.id = e.designation_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN users u ON u.id = e.linked_user_id
     WHERE ${conditions.join(' AND ')} ORDER BY e.full_name ASC`,
    params
  );

  res.json({
    employees: result.rows,
    employeeTypes: EMPLOYEE_TYPES,
    currentStatuses: CURRENT_STATUSES,
    modesOfPayment: MODES_OF_PAYMENT,
    stats: {
      total: result.rows.length,
      active: result.rows.filter((e) => e.current_status === 'Active').length,
      onLeave: result.rows.filter((e) => e.current_status === 'On Leave').length,
      monthlyPayroll: result.rows.filter((e) => e.current_status !== 'Resigned' && e.current_status !== 'Terminated').reduce((s, e) => s + Number(e.monthly_salary), 0),
    },
  });
});

router.get('/:id', requirePermission('hr.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT e.*, d.name AS designation_name, b.name AS branch_name, u.full_name AS linked_user_name
     FROM employees e
     LEFT JOIN designation_masters d ON d.id = e.designation_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN users u ON u.id = e.linked_user_id
     WHERE e.id = $1 AND e.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Employee not found.' });
  res.json(result.rows[0]);
});

router.post('/', requirePermission('hr.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const e = mapEmployeeBody(req.body);
  const invalid = await validateEmployee(e, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const employeeCode = await generateEmployeeCode(client, hospitalId);
    const result = await client.query(
      `INSERT INTO employees (
         hospital_id, employee_code, full_name, gender, date_of_birth, father_name, mother_name, spouse_name,
         marital_status, blood_group, email, contact_no_1, contact_no_2, temporary_address, permanent_address,
         aadhaar_no, pan_no, joining_date, designation_id, department, branch_id, employee_type, current_status,
         bank_name, bank_account_no, bank_ifsc, is_pf, pf_number, is_esi, esi_number, monthly_salary, mode_of_payment,
         linked_user_id, working_hours, duty_shift, employee_group, biometric_code, guardian_relation, remark, photo_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
       RETURNING *`,
      [
        hospitalId, employeeCode, e.fullName, e.gender, e.dateOfBirth, e.fatherName, e.motherName, e.spouseName,
        e.maritalStatus, e.bloodGroup, e.email, e.contactNo1, e.contactNo2, e.temporaryAddress, e.permanentAddress,
        e.aadhaarNo, e.panNo, e.joiningDate, e.designationId, e.department, e.branchId, e.employeeType, e.currentStatus,
        e.bankName, e.bankAccountNo, e.bankIfsc, e.isPf, e.pfNumber, e.isEsi, e.esiNumber, e.monthlySalary, e.modeOfPayment,
        e.linkedUserId, e.workingHours, e.dutyShift, e.employeeGroup, e.biometricCode, e.guardianRelation, e.remark, e.photoUrl,
      ]
    );
    const employee = result.rows[0];

    await client.query(`INSERT INTO employee_wallets (hospital_id, employee_id) VALUES ($1,$2)`, [hospitalId, employee.id]);

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Employee', module: 'HR', details: `${employeeCode} - ${e.fullName}`, ip: req.ip });
    res.status(201).json(employee);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', requirePermission('hr.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const e = mapEmployeeBody(req.body);
  const invalid = await validateEmployee(e, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  const result = await pool.query(
    `UPDATE employees SET
       full_name=$1, gender=$2, date_of_birth=$3, father_name=$4, mother_name=$5, spouse_name=$6, marital_status=$7,
       blood_group=$8, email=$9, contact_no_1=$10, contact_no_2=$11, temporary_address=$12, permanent_address=$13,
       aadhaar_no=$14, pan_no=$15, joining_date=$16, designation_id=$17, department=$18, branch_id=$19,
       employee_type=$20, current_status=$21, bank_name=$22, bank_account_no=$23, bank_ifsc=$24, is_pf=$25,
       pf_number=$26, is_esi=$27, esi_number=$28, monthly_salary=$29, mode_of_payment=$30, linked_user_id=$31,
       working_hours=$32, duty_shift=$33, employee_group=$34, biometric_code=$35, guardian_relation=$36,
       remark=$37, photo_url=$38
     WHERE id=$39 AND hospital_id=$40 RETURNING *`,
    [
      e.fullName, e.gender, e.dateOfBirth, e.fatherName, e.motherName, e.spouseName, e.maritalStatus,
      e.bloodGroup, e.email, e.contactNo1, e.contactNo2, e.temporaryAddress, e.permanentAddress,
      e.aadhaarNo, e.panNo, e.joiningDate, e.designationId, e.department, e.branchId,
      e.employeeType, e.currentStatus, e.bankName, e.bankAccountNo, e.bankIfsc, e.isPf,
      e.pfNumber, e.isEsi, e.esiNumber, e.monthlySalary, e.modeOfPayment, e.linkedUserId,
      e.workingHours, e.dutyShift, e.employeeGroup, e.biometricCode, e.guardianRelation,
      e.remark, e.photoUrl, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Employee not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Employee', module: 'HR', details: result.rows[0].employee_code, ip: req.ip });
  res.json(result.rows[0]);
});

router.patch('/:id/status', requirePermission('hr.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { currentStatus } = req.body;
  if (!CURRENT_STATUSES.includes(currentStatus)) return res.status(400).json({ message: 'Invalid status.' });

  const result = await pool.query(`UPDATE employees SET current_status = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`, [currentStatus, id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Employee not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update Employee Status', module: 'HR', details: `${result.rows[0].employee_code} -> ${currentStatus}`, ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Attendance ====================

// GET /api/employees/attendance?date=&employeeId=
router.get('/attendance/list', requirePermission('hr.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { date = new Date().toISOString().slice(0, 10), employeeId = '' } = req.query;

  const conditions = ['e.hospital_id = $1'];
  const params = [hospitalId, date];
  conditions.push(`(ar.attendance_date = $2 OR ar.attendance_date IS NULL)`);
  if (employeeId) { params.push(employeeId); conditions.push(`e.id = $${params.length}`); }

  const result = await pool.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, ar.id AS attendance_id, ar.check_in, ar.check_out, ar.status
     FROM employees e
     LEFT JOIN attendance_records ar ON ar.employee_id = e.id AND ar.attendance_date = $2
     WHERE ${conditions.join(' AND ')} AND e.current_status = 'Active'
     ORDER BY e.full_name ASC`,
    params
  );
  res.json({ date, attendance: result.rows, statuses: ATTENDANCE_STATUSES });
});

// POST /api/employees/:id/attendance { date, status, checkIn?, checkOut? }
router.post('/:id/attendance', requirePermission('hr.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { date, status, checkIn, checkOut } = req.body;
  if (!date || Number.isNaN(Date.parse(date)) || !ATTENDANCE_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Valid date and status are required.' });
  }
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if ((checkIn && !timeRe.test(checkIn)) || (checkOut && !timeRe.test(checkOut))) {
    return res.status(400).json({ message: 'Check-in and check-out must be times like 09:30.' });
  }
  // The employee id comes from the URL and is a global serial: it must belong to this hospital.
  if (!(await idsBelongToHospital(pool, 'employees', hospitalId, [id])) ) return res.status(404).json({ message: 'Employee not found.' });

  const result = await pool.query(
    `INSERT INTO attendance_records (hospital_id, employee_id, attendance_date, status, check_in, check_out)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET status = EXCLUDED.status, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out
     RETURNING *`,
    [hospitalId, id, date, status, checkIn || null, checkOut || null]
  );
  res.status(201).json(result.rows[0]);
});

// ==================== Leave ====================

router.get('/leave/list', requirePermission('hr.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { status = '' } = req.query;

  const conditions = ['e.hospital_id = $1'];
  const params = [hospitalId];
  if (status) { params.push(status); conditions.push(`lr.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT lr.*, e.employee_code, e.full_name FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY lr.requested_on DESC`,
    params
  );
  res.json({ leaveRequests: result.rows, statuses: LEAVE_STATUSES });
});

router.post('/:id/leave', requirePermission('hr.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { fromDate, toDate, reason } = req.body;
  if (!fromDate || !toDate || Number.isNaN(Date.parse(fromDate)) || Number.isNaN(Date.parse(toDate))) {
    return res.status(400).json({ message: 'Valid from and to dates are required.' });
  }
  if (Date.parse(toDate) < Date.parse(fromDate)) return res.status(400).json({ message: 'The to date cannot be before the from date.' });
  if (!(await idsBelongToHospital(pool, 'employees', hospitalId, [id]))) return res.status(404).json({ message: 'Employee not found.' });

  const result = await pool.query(
    `INSERT INTO leave_requests (hospital_id, employee_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [hospitalId, id, fromDate, toDate, reason || null]
  );
  res.status(201).json(result.rows[0]);
});

router.patch('/leave/:leaveId/decide', requirePermission('hr.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { leaveId } = req.params;
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Invalid decision.' });

  const result = await pool.query(
    `UPDATE leave_requests SET status = $1, decided_by = $2, decided_on = NOW()
     WHERE id = $3 AND hospital_id = $4 AND status = 'Pending' RETURNING *`,
    [status, name, leaveId, hospitalId]
  );
  if (!result.rows[0]) return res.status(400).json({ message: 'Leave request not found or already decided.' });
  res.json(result.rows[0]);
});

module.exports = router;
