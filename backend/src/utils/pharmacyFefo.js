/**
 * FEFO (first-expiry-first-out) batch deduction — mirrors the original app's exact
 * AddMedicineSale logic:
 * 1. Upfront all-or-nothing validation: for every line, total available quantity across
 *    all of that item's batches must cover the requested quantity. If any line falls
 *    short, the whole sale is rejected and nothing is mutated.
 * 2. Deduction: batches are consumed in ascending expiry_date order, taking
 *    min(remaining, batch.quantity) from each until the line's quantity is satisfied.
 * 3. Batch selection is fully automatic — callers only supply {medicineItemId, quantity}.
 *
 * Deviation from the original: instead of writing a comma-joined batch_no string onto the
 * sale line, this returns a real per-batch breakdown so the caller can insert rows into
 * sale_line_batches for proper traceability.
 */

/**
 * @param client pg client/pool (within a transaction)
 * @param lines [{ medicineItemId, quantity }]
 * @returns { ok: boolean, shortages?: [{medicineItemId, requested, available}], plan?: Map<lineIndex, [{batchId, batchNo, quantityTaken}]> }
 */
async function planFefoDeduction(client, lines) {
  const shortages = [];
  const plan = [];

  for (const line of lines) {
    const batchesRes = await client.query(
      // Expired batches are never sold (patient safety); they stay in stock until written off.
      `SELECT * FROM medicine_batches WHERE medicine_item_id = $1 AND quantity > 0 AND expiry_date >= CURRENT_DATE ORDER BY expiry_date ASC`,
      [line.medicineItemId]
    );
    const totalAvailable = batchesRes.rows.reduce((sum, b) => sum + b.quantity, 0);

    if (totalAvailable < line.quantity) {
      shortages.push({ medicineItemId: line.medicineItemId, requested: line.quantity, available: totalAvailable });
      plan.push(null);
      continue;
    }

    let remaining = line.quantity;
    const consumed = [];
    for (const batch of batchesRes.rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.quantity);
      consumed.push({ batchId: batch.id, batchNo: batch.batch_no, quantityTaken: take });
      remaining -= take;
    }
    plan.push(consumed);
  }

  if (shortages.length > 0) {
    return { ok: false, shortages };
  }
  return { ok: true, plan };
}

/** Applies a previously computed FEFO plan: decrements batch quantities. */
async function applyFefoDeduction(client, plan) {
  for (const consumed of plan) {
    for (const { batchId, quantityTaken } of consumed) {
      await client.query(`UPDATE medicine_batches SET quantity = quantity - $1 WHERE id = $2`, [quantityTaken, batchId]);
    }
  }
}

module.exports = { planFefoDeduction, applyFefoDeduction };
