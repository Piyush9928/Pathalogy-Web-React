async function generateUnitNumber(client) {
  const seqRes = await client.query(`SELECT nextval('blood_unit_number_seq') AS seq`);
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `BU-${datePart}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function generateRequestNumber(client) {
  const seqRes = await client.query(`SELECT nextval('blood_request_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `BRQ-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function generateIssueSlipNumber(client) {
  const seqRes = await client.query(`SELECT nextval('blood_issue_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `BIS-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function generateReservationNumber(client) {
  const seqRes = await client.query(`SELECT nextval('blood_reservation_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `BRV-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

module.exports = { generateUnitNumber, generateRequestNumber, generateIssueSlipNumber, generateReservationNumber };
