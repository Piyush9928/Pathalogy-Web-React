const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isPositiveInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

router.param('id', (req, res, next, id) => (isPositiveInt(id) ? next() : res.status(404).json({ message: 'Package not found.' })));

// Returns { error } or { testIds } (de-duplicated numbers). A package bundles tests, so each must be this hospital's own;
// a foreign test in a package would be added to bookings made with it.
async function validatePackage(b, hospitalId, { updating }) {
  if (!String(b.code || '').trim() || !String(b.name || '').trim()) return { error: 'Code and name are required.' };
  if (String(b.code).length > 30 || String(b.name).length > 200) return { error: 'Code must be 30 and name 200 characters or fewer.' };
  if (b.description && String(b.description).length > 500) return { error: 'Description must be 500 characters or fewer.' };
  if (!Array.isArray(b.testIds) || b.testIds.length === 0) return { error: 'Select at least one test.' };
  if (b.testIds.length > 200 || b.testIds.some((t) => !isPositiveInt(t))) return { error: 'Invalid test selection.' };
  if (!isMoney(b.price, 1000000) || Number(b.price) < 1) return { error: 'Price must be between 1 and 1,000,000.' };
  if (updating && b.isActive !== undefined && typeof b.isActive !== 'boolean') return { error: 'isActive must be true or false.' };
  const testIds = [...new Set(b.testIds.map(Number))];
  if (!(await idsBelongToHospital(pool, 'tests', hospitalId, testIds))) return { error: 'One or more tests were not found.' };
  return { testIds };
}

async function hydratePackage(client, pkg) {
  const itemsRes = await client.query(
    `SELECT t.id, t.code, t.name, t.price FROM test_package_items tpi
     JOIN tests t ON t.id = tpi.test_id WHERE tpi.package_id = $1 ORDER BY t.name ASC`,
    [pkg.id]
  );
  const resolvedTests = itemsRes.rows;
  const listPriceTotal = resolvedTests.reduce((sum, t) => sum + Number(t.price), 0);
  const savingsAmount = Math.max(listPriceTotal - Number(pkg.price), 0);
  const savingsPercent = listPriceTotal > 0 ? Math.round((savingsAmount / listPriceTotal) * 100) : 0;
  return { ...pkg, resolvedTests, listPriceTotal, savingsAmount, savingsPercent };
}

// GET /api/test-packages?search=
router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '' } = req.query;

  const result = await pool.query(
    `SELECT * FROM test_packages WHERE hospital_id = $1 AND (name ILIKE $2 OR code ILIKE $2) ORDER BY name ASC`,
    [hospitalId, `%${search}%`]
  );

  const hydrated = await Promise.all(result.rows.map((pkg) => hydratePackage(pool, pkg)));
  res.json({ packages: hydrated });
});

// GET /api/test-packages/:id
router.get('/:id', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM test_packages WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Package not found.' });
  res.json(await hydratePackage(pool, result.rows[0]));
});

// POST /api/test-packages { code, name, description, price, testIds: [] }
router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { code, name, description, price } = req.body;
  const checked = await validatePackage(req.body, hospitalId, { updating: false });
  if (checked.error) return res.status(400).json({ message: checked.error });
  const { testIds } = checked;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pkgRes = await client.query(
      `INSERT INTO test_packages (hospital_id, code, name, description, price) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [hospitalId, code, name, description, price]
    );
    const pkg = pkgRes.rows[0];
    for (const testId of testIds) {
      await client.query(`INSERT INTO test_package_items (package_id, test_id) VALUES ($1,$2)`, [pkg.id, testId]);
    }
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Package', module: 'Laboratory', details: name, ip: req.ip });
    res.status(201).json(await hydratePackage(pool, pkg));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ message: 'Package code already exists.' });
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/test-packages/:id
router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { code, name, description, price, isActive } = req.body;
  const checked = await validatePackage(req.body, hospitalId, { updating: true });
  if (checked.error) return res.status(400).json({ message: checked.error });
  const { testIds } = checked;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // COALESCE: leaving isActive out keeps the current flag (it used to write NULL into a NOT NULL column and 500).
    const pkgRes = await client.query(
      `UPDATE test_packages SET code=$1, name=$2, description=$3, price=$4, is_active=COALESCE($5, is_active) WHERE id=$6 AND hospital_id=$7 RETURNING *`,
      [code, name, description, price, isActive ?? null, id, hospitalId]
    );
    if (!pkgRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Package not found.' });
    }
    await client.query(`DELETE FROM test_package_items WHERE package_id = $1`, [id]);
    for (const testId of testIds) {
      await client.query(`INSERT INTO test_package_items (package_id, test_id) VALUES ($1,$2)`, [id, testId]);
    }
    await client.query('COMMIT');
    res.json(await hydratePackage(pool, pkgRes.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ message: 'Package code already exists.' });
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /api/test-packages/:id
router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM test_packages WHERE id = $1 AND hospital_id = $2 RETURNING name`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Package not found.' });
  res.json({ message: 'Package deleted.' });
});

module.exports = router;
