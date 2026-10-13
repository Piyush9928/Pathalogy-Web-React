const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { round2, computeRunningBalance } = require('../utils/accounting');
const { isMoney, isPositiveMoney, isDateString, idsBelongToHospital } = require('../utils/validate');

const BALANCE_TYPES = ['Dr', 'Cr'];

// Validation for a ledger account body (create and update). Returns a message or null.
async function validateAccountBody(b, hospitalId) {
  if (!String(b.name || '').trim()) return 'Account name is required.';
  if (String(b.name).length > 200) return 'Account name must be 200 characters or fewer.';
  if (!b.groupId || !(await idsBelongToHospital(pool, 'account_groups', hospitalId, [b.groupId]))) return 'Select a valid account group.';
  if (b.openingBalance !== undefined && b.openingBalance !== '' && !isMoney(b.openingBalance)) return 'Opening balance must be 0 or more (use Dr/Cr for the side).';
  if (b.openingBalanceType !== undefined && !BALANCE_TYPES.includes(b.openingBalanceType)) return 'Opening balance type must be Dr or Cr.';
  if (b.creditLimit !== undefined && b.creditLimit !== null && b.creditLimit !== '' && !isMoney(b.creditLimit)) return 'Credit limit must be 0 or more.';
  if (b.creditDays !== undefined && b.creditDays !== null && b.creditDays !== '' && !(Number.isInteger(Number(b.creditDays)) && Number(b.creditDays) >= 0 && Number(b.creditDays) <= 3650)) return 'Credit days must be a whole number, 0 or more.';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return 'Enter a valid email.';
  return null;
}

const router = express.Router();
router.use(requireAuth);

const NATURES = ['Assets', 'Liabilities', 'Income', 'Expense', 'Capital'];
const CASH_BANK_TYPES = ['None', 'Cash', 'Bank', 'Purchase', 'Sale'];
const VOUCHER_TYPES = ['Payment', 'Receipt', 'Journal', 'Contra'];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'];

async function generateVoucherNumber(client) {
  const seqRes = await client.query(`SELECT nextval('voucher_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `VCH-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function getCurrentCompanyAndYear(client, hospitalId) {
  const companyRes = await client.query(`SELECT * FROM companies WHERE hospital_id = $1 AND is_default = TRUE LIMIT 1`, [hospitalId]);
  const company = companyRes.rows[0];
  if (!company) return { company: null, financialYear: null };
  const fyRes = await client.query(`SELECT * FROM financial_years WHERE company_id = $1 AND is_current = TRUE LIMIT 1`, [company.id]);
  return { company, financialYear: fyRes.rows[0] || null };
}

// ==================== Chart of Accounts ====================

router.get('/groups', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM account_groups WHERE hospital_id = $1 ORDER BY nature ASC, name ASC`, [hospitalId]);
  res.json({ groups: result.rows, natures: NATURES, cashBankTypes: CASH_BANK_TYPES });
});

router.post('/groups', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!String(b.name || '').trim() || !String(b.code || '').trim()) return res.status(400).json({ message: 'Name and code are required.' });
  if (b.nature !== undefined && !NATURES.includes(b.nature)) return res.status(400).json({ message: 'Invalid nature.' });
  if (b.cashBankType !== undefined && !CASH_BANK_TYPES.includes(b.cashBankType)) return res.status(400).json({ message: 'Invalid cash/bank type.' });
  if (!(await idsBelongToHospital(pool, 'account_groups', hospitalId, [b.parentGroupId]))) return res.status(400).json({ message: 'Parent group not found.' });

  try {
    const result = await pool.query(
      `INSERT INTO account_groups (hospital_id, name, code, nature, cash_bank_type, parent_group_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [hospitalId, b.name, b.code, b.nature || 'Assets', b.cashBankType || 'None', b.parentGroupId || null]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Account Group', module: 'Accounting', details: b.name, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Account group code already exists.' });
    throw err;
  }
});

router.delete('/groups/:id', requirePermission('accounting.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const group = await pool.query(`SELECT * FROM account_groups WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!group.rows[0]) return res.status(404).json({ message: 'Account group not found.' });
  if (group.rows[0].is_system) return res.status(409).json({ message: 'Cannot delete a system account group.' });

  const inUse = await pool.query(`SELECT 1 FROM ledger_accounts WHERE group_id = $1 LIMIT 1`, [id]);
  if (inUse.rows[0]) return res.status(409).json({ message: 'Cannot delete a group with ledger accounts assigned to it.' });

  await pool.query(`DELETE FROM account_groups WHERE id = $1`, [id]);
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Account Group', module: 'Accounting', details: group.rows[0].name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Account group deleted.' });
});

router.get('/accounts', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', groupId = '' } = req.query;

  const conditions = ['la.hospital_id = $1', '(la.name ILIKE $2 OR la.code ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (groupId) { params.push(groupId); conditions.push(`la.group_id = $${params.length}`); }

  const result = await pool.query(
    `SELECT la.*, g.name AS group_name, g.nature, g.cash_bank_type
     FROM ledger_accounts la JOIN account_groups g ON g.id = la.group_id
     WHERE ${conditions.join(' AND ')} ORDER BY la.name ASC`,
    params
  );
  res.json({ accounts: result.rows });
});

router.post('/accounts', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!String(b.code || '').trim()) return res.status(400).json({ message: 'Name, code, and group are required.' });
  const invalid = await validateAccountBody(b, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  const { financialYear } = await getCurrentCompanyAndYear(pool, hospitalId);

  try {
    const result = await pool.query(
      `INSERT INTO ledger_accounts (
         hospital_id, name, code, group_id, opening_balance, opening_balance_type, financial_year_id,
         contact_person, address_line1, address_line2, gstin, phone, mobile, email, credit_limit, credit_days
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        hospitalId, b.name, b.code, b.groupId, b.openingBalance || 0, b.openingBalanceType || 'Dr', financialYear?.id || null,
        b.contactPerson || null, b.addressLine1 || null, b.addressLine2 || null, b.gstin || null,
        b.phone || null, b.mobile || null, b.email || null, b.creditLimit || null, b.creditDays || null,
      ]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Ledger Account', module: 'Accounting', details: b.name, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Account code already exists.' });
    throw err;
  }
});

router.put('/accounts/:id', requirePermission('accounting.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;

  const invalid = await validateAccountBody(b, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  const result = await pool.query(
    `UPDATE ledger_accounts SET
       name=$1, group_id=$2, opening_balance=$3, opening_balance_type=$4,
       contact_person=$5, address_line1=$6, address_line2=$7, gstin=$8, phone=$9, mobile=$10, email=$11,
       credit_limit=$12, credit_days=$13
     WHERE id=$14 AND hospital_id=$15 RETURNING *`,
    [
      b.name, b.groupId, b.openingBalance || 0, b.openingBalanceType || 'Dr',
      b.contactPerson || null, b.addressLine1 || null, b.addressLine2 || null, b.gstin || null,
      b.phone || null, b.mobile || null, b.email || null, b.creditLimit || null, b.creditDays || null,
      id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Ledger account not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Ledger Account', module: 'Accounting', details: result.rows[0].name, ip: req.ip });
  res.json(result.rows[0]);
});

router.delete('/accounts/:id', requirePermission('accounting.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const account = await pool.query(`SELECT * FROM ledger_accounts WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!account.rows[0]) return res.status(404).json({ message: 'Ledger account not found.' });
  if (account.rows[0].is_system) return res.status(409).json({ message: 'Cannot delete a system ledger account.' });

  const inUse = await pool.query(`SELECT 1 FROM voucher_lines WHERE ledger_account_id = $1 LIMIT 1`, [id]);
  if (inUse.rows[0]) return res.status(409).json({ message: 'Cannot delete an account with posted vouchers.' });

  await pool.query(`DELETE FROM ledger_accounts WHERE id = $1`, [id]);
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Ledger Account', module: 'Accounting', details: account.rows[0].name, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Ledger account deleted.' });
});

// ==================== Vouchers ====================

router.get('/vouchers', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { voucherType = '', fromDate = '', toDate = '' } = req.query;

  const conditions = ['v.hospital_id = $1', 'v.is_cancelled = FALSE'];
  const params = [hospitalId];
  if (voucherType) { params.push(voucherType); conditions.push(`v.voucher_type = $${params.length}`); }
  if (fromDate) { params.push(fromDate); conditions.push(`v.voucher_date >= $${params.length}`); }
  if (toDate) { params.push(toDate); conditions.push(`v.voucher_date <= $${params.length}`); }

  const result = await pool.query(
    `SELECT v.*,
            (SELECT COALESCE(SUM(dr_amount), 0) FROM voucher_lines WHERE voucher_id = v.id) AS total_debit,
            (SELECT COALESCE(SUM(cr_amount), 0) FROM voucher_lines WHERE voucher_id = v.id) AS total_credit
     FROM vouchers v WHERE ${conditions.join(' AND ')} ORDER BY v.voucher_date DESC, v.id DESC`,
    params
  );
  res.json({ vouchers: result.rows, voucherTypes: VOUCHER_TYPES });
});

router.get('/vouchers/:id', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const voucherRes = await pool.query(`SELECT * FROM vouchers WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!voucherRes.rows[0]) return res.status(404).json({ message: 'Voucher not found.' });

  const linesRes = await pool.query(
    `SELECT vl.*, la.name AS ledger_account_name FROM voucher_lines vl JOIN ledger_accounts la ON la.id = vl.ledger_account_id WHERE vl.voucher_id = $1`,
    [id]
  );
  res.json({ ...voucherRes.rows[0], lines: linesRes.rows });
});

// POST /api/accounting/vouchers { voucherType, voucherDate, narration, lines: [{ledgerAccountId, drAmount, crAmount, ...}] }
router.post('/vouchers', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!VOUCHER_TYPES.includes(b.voucherType)) return res.status(400).json({ message: 'Invalid voucher type.' });
  if (!Array.isArray(b.lines) || b.lines.length < 2) return res.status(400).json({ message: 'A voucher requires at least 2 lines.' });
  if (b.lines.length > 100) return res.status(400).json({ message: 'A voucher can have at most 100 lines.' });
  if (b.voucherDate && !isDateString(b.voucherDate)) return res.status(400).json({ message: 'Voucher date is not a valid date.' });

  // Each line posts to exactly one side with a real, non-negative amount. Without this a balanced-looking
  // voucher (e.g. Dr -100 / Cr -100, or all zeros) could be posted and silently distort the books.
  for (const [i, l] of b.lines.entries()) {
    const dr = l.drAmount === undefined || l.drAmount === '' || l.drAmount === null ? 0 : l.drAmount;
    const cr = l.crAmount === undefined || l.crAmount === '' || l.crAmount === null ? 0 : l.crAmount;
    if (!isMoney(dr) || !isMoney(cr)) return res.status(400).json({ message: `Line ${i + 1}: amounts must be numbers, 0 or more.` });
    if ((Number(dr) > 0) === (Number(cr) > 0)) return res.status(400).json({ message: `Line ${i + 1}: enter either a debit or a credit amount (not both, not neither).` });
  }
  if (!(await idsBelongToHospital(pool, 'ledger_accounts', hospitalId, b.lines.map((l) => l.ledgerAccountId)))
      || b.lines.some((l) => !l.ledgerAccountId)) {
    return res.status(400).json({ message: 'One or more ledger accounts were not found.' });
  }

  const totalDr = round2(b.lines.reduce((s, l) => s + Number(l.drAmount || 0), 0));
  const totalCr = round2(b.lines.reduce((s, l) => s + Number(l.crAmount || 0), 0));
  if (totalDr !== totalCr) {
    return res.status(400).json({ message: `Voucher is not balanced: Debit ₹${totalDr} ≠ Credit ₹${totalCr}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { company, financialYear } = await getCurrentCompanyAndYear(client, hospitalId);
    if (financialYear?.is_locked) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Financial year ${financialYear.fin_year} is locked. No further postings are allowed.` });
    }

    const voucherNumber = await generateVoucherNumber(client);
    const voucherRes = await client.query(
      `INSERT INTO vouchers (hospital_id, company_id, financial_year_id, voucher_number, voucher_type, voucher_date, narration, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [hospitalId, company?.id || null, financialYear?.id || null, voucherNumber, b.voucherType, b.voucherDate || new Date(), b.narration || null, name]
    );
    const voucher = voucherRes.rows[0];

    for (const line of b.lines) {
      await client.query(
        `INSERT INTO voucher_lines (voucher_id, ledger_account_id, dr_amount, cr_amount, bill_type, bill_no, bill_date, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [voucher.id, line.ledgerAccountId, line.drAmount || 0, line.crAmount || 0, line.billType || null, line.billNo || null, line.billDate || null, line.dueDate || null]
      );
    }

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Voucher', module: 'Accounting', details: `${voucherNumber} (${b.voucherType})`, ip: req.ip });
    res.status(201).json(voucher);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/vouchers/:id', requirePermission('accounting.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  // A locked financial year is closed to changes: cancelling a voucher in it is a change.
  const existing = await pool.query(
    `SELECT v.id, fy.is_locked, fy.fin_year FROM vouchers v LEFT JOIN financial_years fy ON fy.id = v.financial_year_id
     WHERE v.id = $1 AND v.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!existing.rows[0]) return res.status(404).json({ message: 'Voucher not found.' });
  if (existing.rows[0].is_locked) {
    return res.status(409).json({ message: `Financial year ${existing.rows[0].fin_year} is locked. Its vouchers cannot be cancelled.` });
  }
  const result = await pool.query(`UPDATE vouchers SET is_cancelled = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Voucher not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Voucher', module: 'Accounting', details: result.rows[0].voucher_number, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Ledger Statement ====================

// GET /api/accounting/ledger-statement/:accountId?fromDate=&toDate=
router.get('/ledger-statement/:accountId', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { accountId } = req.params;
  const { fromDate = '', toDate = '' } = req.query;

  const accountRes = await pool.query(`SELECT * FROM ledger_accounts WHERE id = $1 AND hospital_id = $2`, [accountId, hospitalId]);
  const account = accountRes.rows[0];
  if (!account) return res.status(404).json({ message: 'Ledger account not found.' });

  const conditions = ['vl.ledger_account_id = $1', 'v.is_cancelled = FALSE'];
  const params = [accountId];
  if (fromDate) { params.push(fromDate); conditions.push(`v.voucher_date >= $${params.length}`); }
  if (toDate) { params.push(toDate); conditions.push(`v.voucher_date <= $${params.length}`); }

  const linesRes = await pool.query(
    `SELECT vl.*, v.voucher_number, v.voucher_type, v.voucher_date, v.narration
     FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
     WHERE ${conditions.join(' AND ')} ORDER BY v.voucher_date ASC, v.id ASC`,
    params
  );

  const { rows, closingBalance, closingBalanceType } = computeRunningBalance(account.opening_balance, account.opening_balance_type, linesRes.rows);
  res.json({ account, entries: rows, closingBalance, closingBalanceType });
});

// GET /api/accounting/daily-ledger?date= - all voucher lines posted on a given day, across all accounts
router.get('/daily-ledger', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { date = new Date().toISOString().slice(0, 10) } = req.query;

  const result = await pool.query(
    `SELECT vl.*, v.voucher_number, v.voucher_type, v.voucher_date, v.narration, la.name AS ledger_account_name
     FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id JOIN ledger_accounts la ON la.id = vl.ledger_account_id
     WHERE v.hospital_id = $1 AND v.is_cancelled = FALSE AND v.voucher_date = $2
     ORDER BY v.id ASC`,
    [hospitalId, date]
  );
  res.json({
    date, entries: result.rows,
    totals: {
      debit: round2(result.rows.reduce((s, r) => s + Number(r.dr_amount), 0)),
      credit: round2(result.rows.reduce((s, r) => s + Number(r.cr_amount), 0)),
    },
  });
});

// GET /api/accounting/bill-wise-outstanding - open "Against Bill" lines not yet settled
router.get('/bill-wise-outstanding', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT vl.*, v.voucher_number, v.voucher_date, la.name AS ledger_account_name
     FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id JOIN ledger_accounts la ON la.id = vl.ledger_account_id
     WHERE v.hospital_id = $1 AND v.is_cancelled = FALSE AND vl.bill_type IN ('New Reference', 'Against Bill') AND vl.bill_no IS NOT NULL
     ORDER BY vl.due_date ASC NULLS LAST`,
    [hospitalId]
  );
  res.json({ outstanding: result.rows });
});

// ==================== Expenses ====================

router.get('/expenses', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT e.*, h.name AS expense_head_name, p.name AS paid_by_name
     FROM expenses e JOIN ledger_accounts h ON h.id = e.expense_head_account_id
     LEFT JOIN ledger_accounts p ON p.id = e.paid_by_account_id
     WHERE e.hospital_id = $1 ORDER BY e.expense_date DESC`,
    [hospitalId]
  );
  res.json({ expenses: result.rows, paymentModes: PAYMENT_MODES });
});

router.post('/expenses', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;
  if (!b.expenseHeadAccountId || !isPositiveMoney(b.amount)) return res.status(400).json({ message: 'Expense head and an amount greater than 0 are required.' });
  if (b.paymentMode !== undefined && !PAYMENT_MODES.includes(b.paymentMode)) return res.status(400).json({ message: 'Invalid payment mode.' });
  if (b.expenseDate && !isDateString(b.expenseDate)) return res.status(400).json({ message: 'Expense date is not a valid date.' });
  if (!(await idsBelongToHospital(pool, 'ledger_accounts', hospitalId, [b.expenseHeadAccountId, b.paidByAccountId]))) {
    return res.status(400).json({ message: 'Expense head or paid-by account not found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Receipt numbers come from MAX(id)+1, so serialise per hospital to avoid duplicates under concurrency.
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [hospitalId]);
    const seqRes = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM expenses WHERE hospital_id = $1`, [hospitalId]);
    const receiptNumber = `EXP-${String(seqRes.rows[0].next_id).padStart(4, '0')}`;

    const result = await client.query(
      `INSERT INTO expenses (hospital_id, receipt_number, expense_date, expense_head_account_id, paid_to, amount, payment_mode, paid_by_account_id, narration, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [hospitalId, receiptNumber, b.expenseDate || new Date(), b.expenseHeadAccountId, b.paidTo || null, b.amount, b.paymentMode || 'Cash', b.paidByAccountId || null, b.narration || null, name]
    );
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Record Expense', module: 'Accounting', details: `${receiptNumber}: ₹${b.amount}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/expenses/:id/cancel', requirePermission('accounting.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`UPDATE expenses SET is_cancelled = TRUE WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Expense not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Cancel Expense', module: 'Accounting', details: result.rows[0].receipt_number, severity: 'Warning', ip: req.ip });
  res.json(result.rows[0]);
});

module.exports = router;
