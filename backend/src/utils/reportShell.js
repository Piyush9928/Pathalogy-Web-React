const pool = require('../db/pool');

async function generateReportNumber(client) {
  const seqRes = await client.query(`SELECT nextval('report_number_seq') AS seq`);
  const seq = seqRes.rows[0].seq;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `RPT-${yearMonth}-${String(seq).padStart(4, '0')}`;
}

/**
 * Lazily creates a report shell for a booking the first time its status advances past
 * "Booked". Mirrors EnsureReportForBooking in the original app's FakeDataService, but with
 * a real booking_id FK instead of matching on the BookingNumber string.
 */
async function ensureReportForBooking(client, bookingId) {
  const existing = await client.query(`SELECT * FROM test_reports WHERE booking_id = $1`, [bookingId]);
  if (existing.rows[0]) return existing.rows[0];

  const reportNumber = await generateReportNumber(client);
  const result = await client.query(
    `INSERT INTO test_reports (booking_id, report_number, status) VALUES ($1,$2,'Pending') RETURNING *`,
    [bookingId, reportNumber]
  );
  return result.rows[0];
}

module.exports = { generateReportNumber, ensureReportForBooking };
