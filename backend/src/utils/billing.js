/**
 * Invoice money calculations - mirrors Entities/Invoice.cs computed properties exactly
 * (TaxableValue, GstAmount, CgstAmount, SgstAmount, GrandTotal, BalanceDue, PaymentStatus).
 * None of these are stored columns, same as the original's EF `.Ignore()`d properties.
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * @param invoice { sub_total, discount_amount, gst_percent, refund_amount }
 * @param paidAmount total paid so far (sum of the payments table, replacing the
 *        original's single in-place PaidAmount field)
 */
function computeInvoiceTotals(invoice, paidAmount) {
  const subTotal = Number(invoice.sub_total);
  const discount = Number(invoice.discount_amount);
  const gstPercent = Number(invoice.gst_percent);
  const refund = Number(invoice.refund_amount);
  const paid = Number(paidAmount);

  const taxableValue = round2(subTotal - discount);
  const gstAmount = round2(taxableValue * gstPercent / 100);
  const cgstAmount = round2(gstAmount / 2);
  const sgstAmount = round2(gstAmount - cgstAmount);
  const grandTotal = round2(subTotal - discount + gstAmount);
  const balanceDue = round2(grandTotal - paid - refund);

  let paymentStatus;
  if (refund > 0 && refund >= paid) paymentStatus = 'Refunded';
  else if (paid <= 0) paymentStatus = 'Unpaid';
  else if (paid >= grandTotal) paymentStatus = 'Paid';
  else paymentStatus = 'Partially Paid';

  const isCreditOverdue =
    invoice.is_credit_sale &&
    balanceDue > 0 &&
    invoice.invoice_date &&
    new Date(invoice.invoice_date).getTime() + invoice.credit_days * 86400000 < Date.now();

  return { subTotal, discount, taxableValue, gstAmount, cgstAmount, sgstAmount, grandTotal, paidAmount: paid, refund, balanceDue, paymentStatus, isCreditOverdue };
}

module.exports = { round2, computeInvoiceTotals };
