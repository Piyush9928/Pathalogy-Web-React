async function generateSaleNumber(client) {
  const seqRes = await client.query(`SELECT nextval('medicine_sale_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `MSL-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

async function generatePurchaseNumber(client) {
  const seqRes = await client.query(`SELECT nextval('medicine_purchase_number_seq') AS seq`);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `MPU-${yearMonth}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;
}

module.exports = { generateSaleNumber, generatePurchaseNumber };
