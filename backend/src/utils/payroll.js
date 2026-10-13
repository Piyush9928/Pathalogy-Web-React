/**
 * Payroll calculations - mirrors SalaryHead.Calculate(basicSalary) and SalaryPayment's
 * computed properties (GrossSalary/TotalEarnings/TotalDeductions/NetSalaryBeforeTax/
 * TaxAmount/PayableSalary) from the original app exactly.
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates one salary head's amount for a given basic salary.
 * @param head { calculation_type, amount, percent, basic_salary_limit, is_applicable_on_over_limit }
 */
function calculateHeadAmount(head, basicSalary) {
  if (head.calculation_type === 'Fixed') return round2(head.amount);

  // Percent of Basic, with an optional PF-style cap: if a limit is set and the actual
  // basic salary exceeds it, the percentage is applied to the capped limit instead of the
  // full basic (or skipped entirely if is_applicable_on_over_limit is false) - matches the
  // original's SalaryHead.Calculate exactly.
  const limit = head.basic_salary_limit != null ? Number(head.basic_salary_limit) : null;
  if (limit != null && Number(basicSalary) > limit) {
    if (!head.is_applicable_on_over_limit) return 0;
    return round2((limit * Number(head.percent)) / 100);
  }
  return round2((Number(basicSalary) * Number(head.percent)) / 100);
}

/**
 * Computes the full breakdown for a salary payment given its basic salary, day-counts, and
 * a set of resolved salary-payment lines ({ type, amount }).
 * Proration: GrossSalary = BasicSalary / WorkingDays * PaidForDays when WorkingDays > 0,
 * matching the original exactly (day-counts are operator-entered, not auto-derived from
 * attendance/leave - see migration 015 notes).
 */
function computeSalaryTotals({ basicSalary, workingDays, paidForDays, advanceDeduction, tdsPercent, lines }) {
  const basic = Number(basicSalary);
  const proratedBasic = Number(workingDays) > 0 ? round2((basic / Number(workingDays)) * Number(paidForDays)) : basic;

  const totalEarnings = round2(proratedBasic + lines.filter((l) => l.type === 'Earning').reduce((s, l) => s + Number(l.amount), 0));
  const totalDeductions = round2(lines.filter((l) => l.type === 'Deduction').reduce((s, l) => s + Number(l.amount), 0));

  const netSalaryBeforeTax = round2(totalEarnings - totalDeductions);
  const taxAmount = round2((netSalaryBeforeTax * Number(tdsPercent || 0)) / 100);
  const payableSalary = round2(netSalaryBeforeTax - taxAmount - Number(advanceDeduction || 0));

  return { proratedBasic, totalEarnings, totalDeductions, netSalaryBeforeTax, taxAmount, payableSalary };
}

module.exports = { round2, calculateHeadAmount, computeSalaryTotals };
