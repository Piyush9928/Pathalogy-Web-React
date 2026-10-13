const pool = require('../db/pool');

/**
 * Generates a booking number: BK-{yyyyMMdd}-{sequence:D4}.
 * Uses a real Postgres sequence (booking_number_seq) rather than COUNT(*), which the
 * original app used and which could produce duplicate numbers after any row deletion.
 */
async function generateBookingNumber(client) {
  const seqRes = await client.query(`SELECT nextval('booking_number_seq') AS seq`);
  const seq = seqRes.rows[0].seq;
  const today = new Date();
  const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  return `BK-${datePart}-${String(seq).padStart(4, '0')}`;
}

/**
 * Generates a sample barcode value using the hospital's configured prefix/digit-length
 * from company_settings, backed by a real sequence (sample_barcode_seq).
 */
async function generateBarcode(client, hospitalId) {
  const settingsRes = await client.query(
    `SELECT barcode_prefix, barcode_number_length FROM company_settings WHERE hospital_id = $1`,
    [hospitalId]
  );
  const prefix = settingsRes.rows[0]?.barcode_prefix || 'SMP';
  const digits = settingsRes.rows[0]?.barcode_number_length > 0 ? settingsRes.rows[0].barcode_number_length : 6;

  const seqRes = await client.query(`SELECT nextval('sample_barcode_seq') AS seq`);
  const seq = seqRes.rows[0].seq;
  return `${prefix}-${String(seq).padStart(digits, '0')}`;
}

module.exports = { generateBookingNumber, generateBarcode };
