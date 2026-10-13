const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { calculateHeadAmount, computeSalaryTotals } = require('../utils/payroll');
const { isMoney, isPositiveMoney, isNonNegInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const HEAD_TYPES = ['Earning', 'Deduction'];
const CALCULATION_TYPES = ['Fixed', 'Percent of Basic'];
const PAYMENT_MODES = ['Bank Transfer', 'Cash', 'Cheque'];

async function generatePaymentNumber(client) {
  const seqRes = await client.query(`SELECT nextval('salary_payment_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `SAL-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function hydratePayment(client, payment) {
  const linesRes = await client.query(`SELECT * FROM salary_payment_lines WHERE salary_payment_id = $1 ORDER BY id ASC`, [payment.id]);
  const totals = computeSalaryTotals({
    basicSalary: payment.basic_salary, workingDays: payment.working_days, paidForDays: payment.paid_for_days,
    advanceDeduction: payment.advance_deduction, tdsPercent: payment.tds_percent, lines: linesRes.rows,
  });
  return { ...payment, lines: linesRes.rows, ...totals };
}

// ==================== Salary Heads ====================

router.get('/salary-heads', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM salary_heads WHERE hospital_id = $1 ORDER BY display_order ASC, name ASC`, [hospitalId]);
  res.json({ salaryHeads: result.rows, headTypes: HEAD_TYPES, calculationTypes: CALCULATION_TYPES, paymentModes: PAYMENT_MODES });
});

router.post('/salary-heads', requirePermission('payroll.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!String(b.name || '').trim() || !String(b.code || '').trim()) return res.status(400).json({ message: 'Name and code are required.' });
  if (b.type !== undefined && !HEAD_TYPES.includes(b.type)) return res.status(400).json({ message: 'Invalid head type.' });
  if (b.calculationType !== undefined && !CALCULATION_TYPES.includes(b.calculationType)) return res.status(400).json({ message: 'Invalid calculation type.' });
  if (b.amount !== undefined && !isMoney(b.amount)) return res.status(400).json({ message: 'Amount must be 0 or more.' });
  if (b.percent !== undefined && !(Number(b.percent) >= 0 && Number(b.percent) <= 100)) return res.status(400).json({ message: 'Percent must be between 0 and 100.' });
  if (b.basicSalaryLimit !== undefined && b.basicSalaryLimit !== null && b.basicSalaryLimit !== '' && !isMoney(b.basicSalaryLimit)) {
    return res.status(400).json({ message: 'Basic salary limit must be 0 or more.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO salary_heads (hospital_id, name, code, type, calculation_type, amount, percent, basic_salary_limit, is_applicable_on_over_limit, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [hospitalId, b.name, b.code, b.type || 'Earning', b.calculationType || 'Fixed', b.amount || 0, b.percent || 0, b.basicSalaryLimit || null, b.isApplicableOnOverLimit ?? true, b.displayOrder || 0]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Salary Head', module: 'Payroll', details: b.name, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Salary head code already exists.' });
    throw err;
  }
});

router.delete('/salary-heads/:id', requirePermission('payroll.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM salary_heads WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Salary head not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Salary Head', module: 'Payroll', details: result.rows[0].name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Salary head deleted.' });
});

// ==================== Employee Advances ====================

router.get('/advances', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { employeeId = '' } = req.query;
  const conditions = ['a.hospital_id = $1'];
  const params = [hospitalId];
  if (employeeId) { params.push(employeeId); conditions.push(`a.employee_id = $${params.length}`); }

  const result = await pool.query(
    `SELECT a.*, e.employee_code, e.full_name FROM employee_advances a
     JOIN employees e ON e.id = a.employee_id WHERE ${conditions.join(' AND ')} ORDER BY a.advance_date DESC`,
    params
  );

  // Running balance per employee: sum(Dr) - sum(Cr) for non-cancelled entries, matches original.
  const balanceRes = await pool.query(
    `SELECT employee_id, SUM(CASE WHEN dr_cr = 'Dr' THEN amount ELSE -amount END) AS balance
     FROM employee_advances WHERE hospital_id = $1 AND is_cancelled = FALSE GROUP BY employee_id`,
    [hospitalId]
  );
  res.json({ advances: result.rows, balances: balanceRes.rows });
});

router.post('/advances', requirePermission('payroll.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { employeeId, amount, reason, paymentMode, drCr } = req.body;
  if (!employeeId || !isPositiveMoney(amount)) return res.status(400).json({ message: 'Employee and an amount greater than 0 are required.' });
  if (drCr !== undefined && !['Dr', 'Cr'].includes(drCr)) return res.status(400).json({ message: 'Type must be Dr (advance given) or Cr (repayment).' });
  if (paymentMode !== undefined && !['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Card'].includes(paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (reason && String(reason).length > 300) return res.status(400).json({ message: 'Reason must be 300 characters or fewer.' });
  if (!(await idsBelongToHospital(pool, 'employees', hospitalId, [employeeId]))) return res.status(404).json({ message: 'Employee not found.' });

  const result = await pool.query(
    `INSERT INTO employee_advances (hospital_id, employee_id, amount, reason, payment_mode, dr_cr, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [hospitalId, employeeId, amount, reason || null, paymentMode || 'Cash', drCr || 'Dr', name]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Record Employee Advance', module: 'Payroll', details: `Employee #${employeeId}: ₹${amount} (${drCr || 'Dr'})`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

router.patch('/advances/:id/cancel', requirePermission('payroll.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE employee_advances SET is_cancelled = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Advance not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Employee Advance', module: 'Payroll', details: `#${id}`, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Salary Payments ====================

// GET /api/payroll/payments?employeeId=&month=&isApproved=
router.get('/payments', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { employeeId = '', month = '', isApproved = '' } = req.query;

  const conditions = ['sp.hospital_id = $1'];
  const params = [hospitalId];
  if (employeeId) { params.push(employeeId); conditions.push(`sp.employee_id = $${params.length}`); }
  if (month) { params.push(`${month}-01`); conditions.push(`sp.salary_month = $${params.length}`); }
  if (isApproved !== '') { params.push(isApproved === 'true'); conditions.push(`sp.is_approved = $${params.length}`); }

  const result = await pool.query(
    `SELECT sp.*, e.employee_code, e.full_name, d.name AS designation_name
     FROM salary_payments sp JOIN employees e ON e.id = sp.employee_id
     LEFT JOIN designation_masters d ON d.id = e.designation_id
     WHERE ${conditions.join(' AND ')} ORDER BY sp.salary_month DESC, e.full_name ASC`,
    params
  );

  res.json({
    payments: result.rows,
    stats: {
      totalPaid: result.rows.filter((p) => !p.is_cancelled).reduce((s, p) => s + Number(p.payable_salary || 0), 0),
      pendingApproval: result.rows.filter((p) => !p.is_approved && !p.is_cancelled).length,
      count: result.rows.length,
    },
  });
});

router.get('/payments/:id', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `SELECT sp.*, e.employee_code, e.full_name, e.bank_name, e.bank_account_no, e.bank_ifsc, d.name AS designation_name
     FROM salary_payments sp JOIN employees e ON e.id = sp.employee_id
     LEFT JOIN designation_masters d ON d.id = e.designation_id
     WHERE sp.id = $1 AND sp.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Salary payment not found.' });
  res.json(await hydratePayment(pool, result.rows[0]));
});

// GET /api/payroll/payments/preview/:employeeId?month= - computes what a payment WOULD look
// like (resolves active salary heads against the employee's basic salary) without saving,
// so the create form can show live totals before submit.
router.get('/preview/:employeeId', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { employeeId } = req.params;
  const { workingDays = 30, paidForDays = 30 } = req.query;

  const employeeRes = await pool.query(`SELECT * FROM employees WHERE id = $1 AND hospital_id = $2`, [employeeId, hospitalId]);
  const employee = employeeRes.rows[0];
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const headsRes = await pool.query(`SELECT * FROM salary_heads WHERE hospital_id = $1 AND is_active = TRUE ORDER BY display_order ASC`, [hospitalId]);
  const basicSalary = Number(employee.monthly_salary);
  const lines = headsRes.rows
    .filter((h) => h.code !== 'BASIC') // Basic itself is the base, not a computed line
    .map((h) => ({ salary_head_id: h.id, head_name: h.name, type: h.type, amount: calculateHeadAmount(h, basicSalary) }));

  const totals = computeSalaryTotals({ basicSalary, workingDays, paidForDays, advanceDeduction: 0, tdsPercent: 0, lines });
  res.json({ employee, basicSalary, lines, ...totals });
});

// POST /api/payroll/payments
router.post('/payments', requirePermission('payroll.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.employeeId || !b.salaryMonth) return res.status(400).json({ message: 'Employee and salary month are required.' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.salaryMonth))) return res.status(400).json({ message: 'Salary month must look like 2026-04.' });

  // Day counts and money fields are operator-entered; bound them so a typo cannot create an absurd payslip.
  const workingDays = b.workingDays ?? 30;
  const paidForDays = b.paidForDays ?? 30;
  const overTimeDays = b.overTimeDays ?? 0;
  if (!Number.isInteger(Number(workingDays)) || Number(workingDays) < 1 || Number(workingDays) > 31) return res.status(400).json({ message: 'Working days must be between 1 and 31.' });
  for (const [label, v] of [['Absent days', b.absentDays], ['Leave days', b.leaveDays], ['Punishment days', b.punishmentDays], ['Paid leave days', b.paidLeaveDays], ['Paid-for days', paidForDays]]) {
    if (v !== undefined && !isNonNegInt(v)) return res.status(400).json({ message: `${label} must be a whole number, 0 or more.` });
  }
  if (!(Number(overTimeDays) >= 0 && Number(overTimeDays) <= 31)) return res.status(400).json({ message: 'Overtime days must be between 0 and 31.' });
  if (Number(paidForDays) > Number(workingDays) + Number(overTimeDays)) return res.status(400).json({ message: 'Paid-for days cannot exceed working days plus overtime days.' });
  if (b.advanceDeduction !== undefined && !isMoney(b.advanceDeduction)) return res.status(400).json({ message: 'Advance deduction must be 0 or more.' });
  if (b.tdsPercent !== undefined && !(Number(b.tdsPercent) >= 0 && Number(b.tdsPercent) <= 100)) return res.status(400).json({ message: 'TDS percent must be between 0 and 100.' });
  if (b.basicSalary !== undefined && b.basicSalary !== null && !isMoney(b.basicSalary)) return res.status(400).json({ message: 'Basic salary must be 0 or more.' });
  if (b.paymentMode !== undefined && !PAYMENT_MODES.includes(b.paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (b.paymentDate && Number.isNaN(Date.parse(b.paymentDate))) return res.status(400).json({ message: 'Payment date is not a valid date.' });
  const lines = b.lines || [];
  if (!Array.isArray(lines) || lines.length > 50) return res.status(400).json({ message: 'Too many salary lines.' });
  for (const [i, line] of lines.entries()) {
    if (!String(line.headName || '').trim()) return res.status(400).json({ message: `Line ${i + 1}: head name is required.` });
    if (!HEAD_TYPES.includes(line.type)) return res.status(400).json({ message: `Line ${i + 1}: type must be Earning or Deduction.` });
    if (!isMoney(line.amount)) return res.status(400).json({ message: `Line ${i + 1}: amount must be 0 or more.` });
  }
  if (!(await idsBelongToHospital(pool, 'salary_heads', hospitalId, lines.map((l) => l.salaryHeadId)))) {
    return res.status(400).json({ message: 'A selected salary head was not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Locking the employee row serialises concurrent payments for the same person.
    const employeeRes = await client.query(`SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [b.employeeId, hospitalId]);
    if (!employeeRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const duplicate = await client.query(
      `SELECT payment_number FROM salary_payments WHERE hospital_id = $1 AND employee_id = $2 AND salary_month = $3 AND is_cancelled = FALSE LIMIT 1`,
      [hospitalId, b.employeeId, `${b.salaryMonth}-01`]
    );
    if (duplicate.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `${duplicate.rows[0].payment_number} already covers this employee and month. Cancel it first to create a new one.` });
    }

    const totals = computeSalaryTotals({
      basicSalary: b.basicSalary ?? employeeRes.rows[0].monthly_salary, workingDays, paidForDays,
      advanceDeduction: b.advanceDeduction ?? 0, tdsPercent: b.tdsPercent ?? 0, lines: lines.map((l) => ({ type: l.type, amount: l.amount })),
    });
    if (totals.payableSalary < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Deductions exceed earnings: the payable salary would be negative.' });
    }

    const paymentNumber = await generatePaymentNumber(client);
    const paymentRes = await client.query(
      `INSERT INTO salary_payments (
         hospital_id, payment_number, employee_id, salary_month, basic_salary, working_days, absent_days, leave_days,
         punishment_days, over_time_days, paid_leave_days, paid_for_days, advance_deduction, tds_percent,
         payment_date, payment_mode, paid_by_account_id, remarks, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        hospitalId, paymentNumber, b.employeeId, `${b.salaryMonth}-01`, b.basicSalary ?? employeeRes.rows[0].monthly_salary,
        b.workingDays ?? 30, b.absentDays ?? 0, b.leaveDays ?? 0, b.punishmentDays ?? 0, b.overTimeDays ?? 0,
        b.paidLeaveDays ?? 0, b.paidForDays ?? 30, b.advanceDeduction ?? 0, b.tdsPercent ?? 0,
        b.paymentDate || new Date(), b.paymentMode || 'Bank Transfer', req.user.userId, b.remarks || null, name,
      ]
    );
    const payment = paymentRes.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO salary_payment_lines (salary_payment_id, salary_head_id, head_name, type, amount) VALUES ($1,$2,$3,$4,$5)`,
        [payment.id, line.salaryHeadId || null, line.headName, line.type, line.amount]
      );
    }

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Salary Payment', module: 'Payroll', details: `${paymentNumber}: ${employeeRes.rows[0].full_name}`, ip: req.ip });
    res.status(201).json(await hydratePayment(pool, payment));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/payments/:id/approve', requirePermission('payroll.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE salary_payments SET is_approved = TRUE WHERE id = $1 AND hospital_id = $2 AND is_cancelled = FALSE RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Salary payment not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Approve Salary Payment', module: 'Payroll', details: result.rows[0].payment_number, ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/payments/:id/reject', requirePermission('payroll.approve'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE salary_payments SET is_approved = FALSE, is_cancelled = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Salary payment not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Reject Salary Payment', module: 'Payroll', details: result.rows[0].payment_number, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

router.post('/payments/:id/cancel', requirePermission('payroll.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE salary_payments SET is_cancelled = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Salary payment not found.' });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Salary Payment', module: 'Payroll', details: result.rows[0].payment_number, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Salary Register (report) ====================

router.get('/salary-register', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { month = '' } = req.query;
  const conditions = ['sp.hospital_id = $1', 'sp.is_cancelled = FALSE'];
  const params = [hospitalId];
  if (month) { params.push(`${month}-01`); conditions.push(`sp.salary_month = $${params.length}`); }

  const result = await pool.query(
    `SELECT sp.*, e.employee_code, e.full_name, d.name AS designation_name
     FROM salary_payments sp JOIN employees e ON e.id = sp.employee_id
     LEFT JOIN designation_masters d ON d.id = e.designation_id
     WHERE ${conditions.join(' AND ')} ORDER BY e.full_name ASC`,
    params
  );

  const hydrated = [];
  for (const row of result.rows) hydrated.push(await hydratePayment(pool, row));

  res.json({
    rows: hydrated,
    totals: hydrated.reduce(
      (acc, r) => ({
        totalEarnings: acc.totalEarnings + r.totalEarnings, totalDeductions: acc.totalDeductions + r.totalDeductions,
        payableSalary: acc.payableSalary + r.payableSalary,
      }),
      { totalEarnings: 0, totalDeductions: 0, payableSalary: 0 }
    ),
  });
});

// ==================== Wallets ====================

router.get('/wallets', requirePermission('payroll.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT w.*, e.employee_code, e.full_name FROM employee_wallets w JOIN employees e ON e.id = w.employee_id
     WHERE w.hospital_id = $1 ORDER BY e.full_name ASC`,
    [hospitalId]
  );
  res.json({ wallets: result.rows });
});

router.post('/wallets/:id/opening', requirePermission('payroll.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { amount } = req.body;
  if (!isPositiveMoney(amount)) return res.status(400).json({ message: 'Enter an amount greater than 0.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletRes = await client.query(`SELECT * FROM employee_wallets WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    if (!walletRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Wallet not found.' });
    }
    const entry = await client.query(`INSERT INTO wallet_opening_entries (wallet_id, amount, created_by) VALUES ($1,$2,$3) RETURNING *`, [id, amount, name]);
    await client.query(`UPDATE employee_wallets SET balance = balance + $1 WHERE id = $2`, [amount, id]);
    await client.query('COMMIT');
    res.status(201).json(entry.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/wallets/opening/:entryId/cancel', requirePermission('payroll.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { entryId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scoped through the wallet so one hospital cannot cancel another's opening entry.
    const entryRes = await client.query(
      `SELECT e.* FROM wallet_opening_entries e JOIN employee_wallets w ON w.id = e.wallet_id
       WHERE e.id = $1 AND e.is_cancelled = FALSE AND w.hospital_id = $2 FOR UPDATE OF e`,
      [entryId, hospitalId]
    );
    if (!entryRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Opening entry not found or already cancelled.' });
    }
    const wallet = await client.query(`SELECT balance FROM employee_wallets WHERE id = $1 FOR UPDATE`, [entryRes.rows[0].wallet_id]);
    if (Number(wallet.rows[0].balance) < Number(entryRes.rows[0].amount)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cannot cancel: part of this opening balance has already been transferred out.' });
    }
    await client.query(`UPDATE wallet_opening_entries SET is_cancelled = TRUE WHERE id = $1`, [entryId]);
    await client.query(`UPDATE employee_wallets SET balance = balance - $1 WHERE id = $2`, [entryRes.rows[0].amount, entryRes.rows[0].wallet_id]);
    await client.query('COMMIT');
    res.json({ message: 'Opening entry cancelled.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/payroll/wallets/transfer { fromWalletId, toWalletId, amount, remarks }
router.post('/wallets/transfer', requirePermission('payroll.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { fromWalletId, toWalletId, amount, remarks } = req.body;
  if (!fromWalletId || !toWalletId || !isPositiveMoney(amount)) {
    return res.status(400).json({ message: 'From wallet, to wallet, and an amount greater than 0 are required.' });
  }
  if (Number(fromWalletId) === Number(toWalletId)) return res.status(400).json({ message: 'Cannot transfer to the same wallet.' });
  if (remarks && String(remarks).length > 300) return res.status(400).json({ message: 'Remarks must be 300 characters or fewer.' });

  // Wallet ids are global serials: both wallets must belong to this hospital.
  if (!(await idsBelongToHospital(pool, 'employee_wallets', hospitalId, [fromWalletId, toWalletId]))) {
    return res.status(404).json({ message: 'Wallet not found.' });
  }
  const fromRes = await pool.query(`SELECT * FROM employee_wallets WHERE id = $1 AND hospital_id = $2`, [fromWalletId, hospitalId]);
  if (!fromRes.rows[0] || Number(fromRes.rows[0].balance) < Number(amount)) {
    return res.status(400).json({ message: 'Insufficient wallet balance.' });
  }

  const result = await pool.query(
    `INSERT INTO wallet_transfer_entries (from_wallet_id, to_wallet_id, amount, remarks, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [fromWalletId, toWalletId, amount, remarks || null, name]
  );
  res.status(201).json(result.rows[0]);
});

router.post('/wallets/transfer/:id/accept', requirePermission('payroll.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scoped via the source wallet, and locked so a transfer cannot be accepted twice concurrently.
    const transferRes = await client.query(
      `SELECT t.* FROM wallet_transfer_entries t JOIN employee_wallets w ON w.id = t.from_wallet_id
       WHERE t.id = $1 AND t.status = 'Pending' AND w.hospital_id = $2 FOR UPDATE OF t`,
      [id, hospitalId]
    );
    const transfer = transferRes.rows[0];
    if (!transfer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transfer not found or already decided.' });
    }
    // Lock both wallets in id order (avoids deadlocks) and re-check funds: the balance may have
    // dropped since the request was raised (other pending transfers, salary advances, etc.).
    const [lo, hi] = [transfer.from_wallet_id, transfer.to_wallet_id].sort((a, b) => a - b);
    await client.query(`SELECT id FROM employee_wallets WHERE id IN ($1,$2) AND hospital_id = $3 ORDER BY id FOR UPDATE`, [lo, hi, hospitalId]);
    const fromNow = await client.query(`SELECT balance FROM employee_wallets WHERE id = $1`, [transfer.from_wallet_id]);
    if (Number(fromNow.rows[0].balance) < Number(transfer.amount)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient wallet balance to accept this transfer.' });
    }
    await client.query(`UPDATE employee_wallets SET balance = balance - $1 WHERE id = $2`, [transfer.amount, transfer.from_wallet_id]);
    await client.query(`UPDATE employee_wallets SET balance = balance + $1 WHERE id = $2`, [transfer.amount, transfer.to_wallet_id]);
    const result = await client.query(`UPDATE wallet_transfer_entries SET status = 'Accepted', decided_on = NOW() WHERE id = $1 RETURNING *`, [id]);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/wallets/transfer/:id/reject', requirePermission('payroll.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE wallet_transfer_entries t SET status = 'Rejected', decided_on = NOW()
     FROM employee_wallets w WHERE t.id = $1 AND t.status = 'Pending' AND w.id = t.from_wallet_id AND w.hospital_id = $2 RETURNING t.*`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Transfer not found or already decided.' });
  res.json(result.rows[0]);
});

router.post('/wallets/transfer/:id/cancel', requirePermission('payroll.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE wallet_transfer_entries t SET status = 'Cancelled', decided_on = NOW()
     FROM employee_wallets w WHERE t.id = $1 AND t.status = 'Pending' AND w.id = t.from_wallet_id AND w.hospital_id = $2 RETURNING t.*`,
    [id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Transfer not found or already decided.' });
  res.json(result.rows[0]);
});

module.exports = router;
