// Small shared input checks for write routes. Kept dependency-free on purpose.

const isInt = (v) => v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v));
const isPositiveInt = (v) => isInt(v) && Number(v) > 0;
const isNonNegInt = (v) => isInt(v) && Number(v) >= 0;
// Non-negative amount that fits NUMERIC(10,2) (and is a real number, not NaN/Infinity).
const isMoney = (v, max = 99999999.99) =>
  v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max;
const isPositiveMoney = (v, max) => isMoney(v, max) && Number(v) > 0;
const isDateString = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// Tables a caller may check ownership against. Names are never taken from user input.
const HOSPITAL_SCOPED = new Set([
  'suppliers', 'inventory_items', 'stock_group_masters', 'stock_sub_group_masters', 'commodity_masters', 'unit_masters',
  'employees', 'employee_wallets', 'designation_masters', 'branches', 'users', 'salary_heads', 'ledger_accounts', 'account_groups',
  'patients', 'doctors', 'bank_accounts', 'invoices', 'departments', 'analytes', 'tests', 'bookings',
  'sample_types', 'containers', 'test_packages',
]);

/**
 * True when every id in `ids` (nulls/undefined ignored) is a row of `table` owned by `hospitalId`.
 * Ids are global serials, so any id coming from a request body must be checked like this
 * before it is used as a foreign key or to modify another row.
 */
async function idsBelongToHospital(client, table, hospitalId, ids) {
  if (!HOSPITAL_SCOPED.has(table)) throw new Error(`Table not allowed for scoped check: ${table}`);
  const unique = [...new Set(ids.filter((id) => id !== null && id !== undefined && id !== ''))];
  if (unique.length === 0) return true;
  if (unique.some((id) => !isPositiveInt(id))) return false;
  const res = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE hospital_id = $1 AND id = ANY($2::int[])`,
    [hospitalId, unique.map(Number)]
  );
  return res.rows[0].n === unique.length;
}

// Makes route params like :id answer 404 when they are not a plain positive integer (instead of a Postgres 500).
function paramGuard(router, ...names) {
  for (const n of names) {
    router.param(n, (req, res, next, v) => (isPositiveInt(v) && Number(v) < 2147483647 ? next() : res.status(404).json({ message: 'Not found.' })));
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-() ]{5,30}$/;
const tooLong = (v, n) => v !== undefined && v !== null && String(v).length > n;

module.exports = { paramGuard, EMAIL_RE, PHONE_RE, tooLong, isInt, isPositiveInt, isNonNegInt, isMoney, isPositiveMoney, isDateString, idsBelongToHospital };
