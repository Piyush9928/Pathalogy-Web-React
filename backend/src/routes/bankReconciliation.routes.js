const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isPositiveInt, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const MAX_BALANCE = 999999999999.99; // NUMERIC(14,2)
const MAX_TRANSACTIONS_PER_STATEMENT = 5000;
const isBalance = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= MAX_BALANCE; // may be negative (overdraft)

// A bank statement / transaction belongs to a hospital through its bank account.
const TXN_SCOPE = `JOIN bank_statements bs ON bs.id = bt.bank_statement_id JOIN bank_accounts ba ON ba.id = bs.bank_account_id`;

// ==================== Bank Accounts ====================

router.get('/accounts', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT ba.*, la.name AS ledger_account_name FROM bank_accounts ba JOIN ledger_accounts la ON la.id = ba.ledger_account_id
     WHERE ba.hospital_id = $1 ORDER BY ba.bank_name ASC`,
    [hospitalId]
  );
  res.json({ bankAccounts: result.rows });
});

function validateBankAccountFields({ bankName, accountNumber, ifsc, branchName }) {
  if (!String(bankName || '').trim() || !String(accountNumber || '').trim()) return 'Bank name and account number are required.';
  if (String(bankName).length > 150) return 'Bank name must be 150 characters or fewer.';
  if (String(accountNumber).length > 30) return 'Account number must be 30 characters or fewer.';
  if (ifsc && String(ifsc).length > 15) return 'IFSC must be 15 characters or fewer.';
  if (branchName && String(branchName).length > 150) return 'Branch name must be 150 characters or fewer.';
  return null;
}

router.post('/accounts', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { ledgerAccountId, bankName, accountNumber, ifsc, branchName, currentBalance } = req.body;
  if (!ledgerAccountId || !bankName || !accountNumber) return res.status(400).json({ message: 'Ledger account, bank name, and account number are required.' });
  const invalid = validateBankAccountFields(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  if (currentBalance !== undefined && currentBalance !== '' && !isBalance(currentBalance)) return res.status(400).json({ message: 'Current balance must be a number.' });
  // The linked ledger must be this hospital's own ledger account.
  if (!isPositiveInt(ledgerAccountId) || !(await idsBelongToHospital(pool, 'ledger_accounts', hospitalId, [ledgerAccountId]))) {
    return res.status(404).json({ message: 'Ledger account not found.' });
  }

  const result = await pool.query(
    `INSERT INTO bank_accounts (hospital_id, ledger_account_id, bank_name, account_number, ifsc, branch_name, current_balance)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [hospitalId, ledgerAccountId, bankName.trim(), accountNumber.trim(), ifsc || null, branchName || null, currentBalance || 0]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Add Bank Account', module: 'Bank Reconciliation', details: `${bankName} - ${accountNumber}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

router.put('/accounts/:id', requirePermission('accounting.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { bankName, accountNumber, ifsc, branchName, isActive } = req.body;
  const invalid = validateBankAccountFields(req.body);
  if (invalid) return res.status(400).json({ message: invalid });

  const result = await pool.query(
    `UPDATE bank_accounts SET bank_name=$1, account_number=$2, ifsc=$3, branch_name=$4, is_active=$5 WHERE id=$6 AND hospital_id=$7 RETURNING *`,
    [bankName.trim(), accountNumber.trim(), ifsc || null, branchName || null, isActive ?? true, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Bank account not found.' });
  res.json(result.rows[0]);
});

router.get('/accounts/:id', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const accountRes = await pool.query(
    `SELECT ba.*, la.name AS ledger_account_name FROM bank_accounts ba JOIN ledger_accounts la ON la.id = ba.ledger_account_id
     WHERE ba.id = $1 AND ba.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!accountRes.rows[0]) return res.status(404).json({ message: 'Bank account not found.' });

  const statementsRes = await pool.query(`SELECT * FROM bank_statements WHERE bank_account_id = $1 ORDER BY from_date DESC`, [id]);
  res.json({ ...accountRes.rows[0], statements: statementsRes.rows });
});

// ==================== Statements & Transactions ====================

// POST /api/bank-reconciliation/accounts/:id/statements { fromDate, toDate, openingBalance, closingBalance, transactions: [{date, description, debitAmount, creditAmount}] }
router.post('/accounts/:id/statements', requirePermission('accounting.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const b = req.body;
  if (!b.fromDate || !b.toDate) return res.status(400).json({ message: 'From date and to date are required.' });
  if (!isDateString(b.fromDate) || !isDateString(b.toDate)) return res.status(400).json({ message: 'From and to dates must be valid dates.' });
  if (Date.parse(b.toDate) < Date.parse(b.fromDate)) return res.status(400).json({ message: 'The to date cannot be before the from date.' });
  for (const [label, v] of [['Opening balance', b.openingBalance], ['Closing balance', b.closingBalance]]) {
    if (v !== undefined && v !== '' && !isBalance(v)) return res.status(400).json({ message: `${label} must be a number.` });
  }

  // Each statement line is either money out (debit) or money in (credit), never both and never empty.
  const transactions = b.transactions || [];
  if (!Array.isArray(transactions) || transactions.length > MAX_TRANSACTIONS_PER_STATEMENT) {
    return res.status(400).json({ message: `A statement can have at most ${MAX_TRANSACTIONS_PER_STATEMENT} transactions.` });
  }
  for (const [i, t] of transactions.entries()) {
    const n = i + 1;
    const debit = t.debitAmount ?? 0;
    const credit = t.creditAmount ?? 0;
    if (!t.date || !isDateString(t.date)) return res.status(400).json({ message: `Transaction ${n}: a valid date is required.` });
    if (!isMoney(debit, MAX_BALANCE) || !isMoney(credit, MAX_BALANCE)) return res.status(400).json({ message: `Transaction ${n}: amounts must be numbers, 0 or more.` });
    if ((Number(debit) > 0) === (Number(credit) > 0)) return res.status(400).json({ message: `Transaction ${n}: enter either a debit or a credit amount (not both, not neither).` });
    if (t.description && String(t.description).length > 300) return res.status(400).json({ message: `Transaction ${n}: description must be 300 characters or fewer.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bankAccountRes = await client.query(`SELECT * FROM bank_accounts WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
    if (!bankAccountRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bank account not found.' });
    }

    const statementRes = await client.query(
      `INSERT INTO bank_statements (bank_account_id, from_date, to_date, opening_balance, closing_balance, imported_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, b.fromDate, b.toDate, b.openingBalance || 0, b.closingBalance || 0, name]
    );
    const statement = statementRes.rows[0];

    for (const t of transactions) {
      await client.query(
        `INSERT INTO bank_transactions (bank_statement_id, transaction_date, description, debit_amount, credit_amount)
         VALUES ($1,$2,$3,$4,$5)`,
        [statement.id, t.date, t.description || null, t.debitAmount || 0, t.creditAmount || 0]
      );
    }

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Import Bank Statement', module: 'Bank Reconciliation', details: `${bankAccountRes.rows[0].bank_name}: ${b.fromDate} to ${b.toDate}`, ip: req.ip });
    res.status(201).json(statement);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/statements/:id/transactions', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const statement = await pool.query(
    `SELECT 1 FROM bank_statements bs JOIN bank_accounts ba ON ba.id = bs.bank_account_id WHERE bs.id = $1 AND ba.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!statement.rows[0]) return res.status(404).json({ message: 'Statement not found.' });

  const result = await pool.query(
    `SELECT bt.* FROM bank_transactions bt ${TXN_SCOPE} WHERE bt.bank_statement_id = $1 AND ba.hospital_id = $2 ORDER BY bt.transaction_date ASC`,
    [id, hospitalId]
  );
  res.json({ transactions: result.rows });
});

// ==================== Matching ====================

// POST /api/bank-reconciliation/transactions/:id/match { matchedInvoiceId?, matchedPaymentId? }
router.post('/transactions/:id/match', requirePermission('accounting.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { matchedInvoiceId, matchedPaymentId } = req.body;
  if (!matchedInvoiceId && !matchedPaymentId) return res.status(400).json({ message: 'Select an invoice or payment to match against.' });
  if ((matchedInvoiceId && !isPositiveInt(matchedInvoiceId)) || (matchedPaymentId && !isPositiveInt(matchedPaymentId))) {
    return res.status(400).json({ message: 'Invalid invoice or payment.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The transaction must belong to this hospital; lock it so two matches cannot race.
    const txnRes = await client.query(
      `SELECT bt.* FROM bank_transactions bt ${TXN_SCOPE} WHERE bt.id = $1 AND ba.hospital_id = $2 FOR UPDATE OF bt`,
      [id, hospitalId]
    );
    const txn = txnRes.rows[0];
    if (!txn) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found.' });
    }
    if (txn.is_matched) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This transaction is already matched. Unmatch it first.' });
    }

    // The invoice / payment being matched must also be this hospital's.
    if (matchedInvoiceId && !(await idsBelongToHospital(client, 'invoices', hospitalId, [matchedInvoiceId]))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found.' });
    }
    if (matchedPaymentId) {
      const pay = await client.query(
        // FOR UPDATE OF p: two different transactions racing to claim the same payment are serialised here.
        `SELECT p.id FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.id = $1 AND i.hospital_id = $2 FOR UPDATE OF p`,
        [matchedPaymentId, hospitalId]
      );
      if (!pay.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Payment not found.' });
      }
      // One bank line per payment: a payment already matched elsewhere cannot be matched again.
      const taken = await client.query(`SELECT 1 FROM bank_transactions WHERE matched_payment_id = $1 LIMIT 1`, [matchedPaymentId]);
      if (taken.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'This payment is already matched to another bank transaction.' });
      }
    }

    await client.query(
      `UPDATE bank_transactions SET is_matched = TRUE, matched_invoice_id = $1, matched_payment_id = $2 WHERE id = $3`,
      [matchedInvoiceId || null, matchedPaymentId || null, id]
    );
    const result = await client.query(
      `INSERT INTO reconciliation_matches (bank_transaction_id, matched_invoice_id, matched_payment_id, match_type, matched_by)
       VALUES ($1,$2,$3,'Manual',$4) RETURNING *`,
      [id, matchedInvoiceId || null, matchedPaymentId || null, name]
    );
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Match Bank Transaction', module: 'Bank Reconciliation', details: `Transaction #${id}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/transactions/:id/unmatch', requirePermission('accounting.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txnRes = await client.query(
      `SELECT bt.id FROM bank_transactions bt ${TXN_SCOPE} WHERE bt.id = $1 AND ba.hospital_id = $2 FOR UPDATE OF bt`,
      [id, hospitalId]
    );
    if (!txnRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found.' });
    }
    await client.query(`UPDATE bank_transactions SET is_matched = FALSE, matched_invoice_id = NULL, matched_payment_id = NULL WHERE id = $1`, [id]);
    await client.query(`DELETE FROM reconciliation_matches WHERE bank_transaction_id = $1`, [id]);
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Unmatch Bank Transaction', module: 'Bank Reconciliation', details: `Transaction #${id}`, severity: 'Warning', ip: req.ip });
    res.json({ message: 'Transaction unmatched.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/bank-reconciliation/accounts/:id/auto-match { toleranceDays }
// Matching algorithm replicated from the original: for each unmatched transaction, look for an
// unmatched payment on this hospital's invoices with the same amount within a day-tolerance
// window. Confirmed matches are recorded as MatchType='Auto'.
// Deviation: only CREDIT lines (money received) are candidates. A payment row is money received, so
// matching a debit (money out) of the same figure to it was always a false match.
router.post('/accounts/:id/auto-match', requirePermission('accounting.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const toleranceDays = req.body.toleranceDays ?? 3;
  if (!Number.isInteger(Number(toleranceDays)) || Number(toleranceDays) < 0 || Number(toleranceDays) > 30) {
    return res.status(400).json({ message: 'Tolerance must be a whole number of days between 0 and 30.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Scope to this hospital's bank account and serialise concurrent runs on it.
    const account = await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [id, hospitalId]);
    if (!account.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bank account not found.' });
    }

    const unmatchedTxnsRes = await client.query(
      `SELECT bt.* FROM bank_transactions bt JOIN bank_statements bs ON bs.id = bt.bank_statement_id
       WHERE bs.bank_account_id = $1 AND bt.is_matched = FALSE AND bt.credit_amount > 0`,
      [id]
    );

    let matchedCount = 0;
    for (const txn of unmatchedTxnsRes.rows) {
      const candidateRes = await client.query(
        `SELECT p.* FROM payments p JOIN invoices i ON i.id = p.invoice_id
         WHERE i.hospital_id = $1 AND p.amount = $2
           AND p.paid_at::date BETWEEN ($3::date - $4::int) AND ($3::date + $4::int)
           AND p.id NOT IN (SELECT matched_payment_id FROM bank_transactions WHERE matched_payment_id IS NOT NULL)
         LIMIT 1`,
        [hospitalId, txn.credit_amount, txn.transaction_date, Number(toleranceDays)]
      );
      const candidate = candidateRes.rows[0];
      if (!candidate) continue;

      await client.query(`UPDATE bank_transactions SET is_matched = TRUE, matched_payment_id = $1 WHERE id = $2`, [candidate.id, txn.id]);
      await client.query(
        `INSERT INTO reconciliation_matches (bank_transaction_id, matched_payment_id, match_type, matched_by) VALUES ($1,$2,'Auto',$3)`,
        [txn.id, candidate.id, name]
      );
      matchedCount += 1;
    }

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Auto-Match Bank Transactions', module: 'Bank Reconciliation', details: `${matchedCount} matched (±${toleranceDays}d)`, ip: req.ip });
    res.json({ matchedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/bank-reconciliation/accounts/:id/report - reconciliation summary
router.get('/accounts/:id/report', requirePermission('accounting.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const account = await pool.query(`SELECT 1 FROM bank_accounts WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!account.rows[0]) return res.status(404).json({ message: 'Bank account not found.' });

  const result = await pool.query(
    `SELECT bt.*, bs.from_date, bs.to_date FROM bank_transactions bt JOIN bank_statements bs ON bs.id = bt.bank_statement_id
     WHERE bs.bank_account_id = $1 ORDER BY bt.transaction_date ASC`,
    [id]
  );
  const rows = result.rows;
  res.json({
    transactions: rows,
    summary: {
      total: rows.length,
      matched: rows.filter((r) => r.is_matched).length,
      unmatched: rows.filter((r) => !r.is_matched).length,
      unmatchedAmount: rows.filter((r) => !r.is_matched).reduce((s, r) => s + Number(r.debit_amount) + Number(r.credit_amount), 0),
    },
  });
});

module.exports = router;
