/**
 * Accounting helpers - real double-entry balance math, mirrors the original's
 * LedgerAccount.SignedOpeningBalance and LedgerStatement/DailyLedger running-balance walk.
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Positive = Dr, negative = Cr, matching the original's SignedOpeningBalance. */
function signedAmount(amount, type) {
  return type === 'Dr' ? Number(amount) : -Number(amount);
}

/**
 * Walks a chronological list of voucher lines ({ dr_amount, cr_amount, voucher_date, ... })
 * for one ledger account and returns each line annotated with a running balance, starting
 * from the account's opening balance.
 */
function computeRunningBalance(openingBalance, openingBalanceType, lines) {
  let balance = signedAmount(openingBalance, openingBalanceType);
  const rows = [];
  for (const line of lines) {
    balance = round2(balance + Number(line.dr_amount) - Number(line.cr_amount));
    rows.push({ ...line, runningBalance: balance, runningBalanceType: balance >= 0 ? 'Dr' : 'Cr' });
  }
  return { rows, closingBalance: Math.abs(balance), closingBalanceType: balance >= 0 ? 'Dr' : 'Cr' };
}

module.exports = { round2, signedAmount, computeRunningBalance };
