const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isPositiveInt, isNonNegInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// A test must be addressed by a positive integer id; anything else is simply "not found".
router.param('id', (req, res, next, id) => (isPositiveInt(id) ? next() : res.status(404).json({ message: 'Test not found.' })));

const COMMISSION_MODES = ['Percent', 'Fixed'];
const BAND_GENDERS = ['All', 'Male', 'Female', 'Child'];

// Returns a message when the mapped test is invalid, otherwise null. The price here is what every booking and
// invoice for this test is later built from, so it is checked strictly.
async function validateTest(t, hospitalId) {
  if (!String(t.code || '').trim() || !String(t.name || '').trim() || !t.departmentId || !t.sampleTypeId) {
    return 'Code, name, department, and sample type are required.';
  }
  if (String(t.code).length > 30 || String(t.name).length > 200) return 'Code must be 30 and name 200 characters or fewer.';
  if (t.serviceCode && String(t.serviceCode).length > 30) return 'Service code must be 30 characters or fewer.';
  if (t.referenceRange && String(t.referenceRange).length > 200) return 'Reference range must be 200 characters or fewer.';
  if (!isMoney(t.price, 100000)) return 'Price must be between 0 and 100000.';
  if (!isMoney(t.actualCost, 99999999.99)) return 'Actual cost must be 0 or more.';
  if (!(Number.isFinite(Number(t.gstPercent)) && Number(t.gstPercent) >= 0 && Number(t.gstPercent) <= 100)) return 'GST must be between 0 and 100.';
  if (!(isPositiveInt(t.turnaroundHours) && Number(t.turnaroundHours) <= 168)) return 'Turnaround hours must be a whole number between 1 and 168.';
  if (!COMMISSION_MODES.includes(t.commissionMode)) return 'Invalid commission mode.';
  if (!isMoney(t.fixedCommissionAmount, 99999999.99)) return 'Fixed commission must be 0 or more.';
  if (t.commissionPercentOverride !== null && !(Number(t.commissionPercentOverride) >= 0 && Number(t.commissionPercentOverride) <= 100)) return 'Commission override must be between 0 and 100.';
  for (const k of ['isInHouseTest', 'isVariableCharges', 'isListedAtPrescription', 'isCommissionable']) {
    if (typeof t[k] !== 'boolean') return `${k} must be true or false.`;
  }
  // Department, sample type and container ids are global serials: they must be this hospital's own.
  if (!(await idsBelongToHospital(pool, 'departments', hospitalId, [t.departmentId]))) return 'Department not found.';
  if (!(await idsBelongToHospital(pool, 'sample_types', hospitalId, [t.sampleTypeId]))) return 'Sample type not found.';
  if (t.containerId && !(await idsBelongToHospital(pool, 'containers', hospitalId, [t.containerId]))) return 'Container not found.';
  return null;
}

function mapTestBody(body) {
  return {
    code: body.code,
    name: body.name,
    departmentId: body.departmentId || null,
    sampleTypeId: body.sampleTypeId || null,
    containerId: body.containerId || null,
    price: body.price ?? 0,
    actualCost: body.actualCost ?? 0,
    gstPercent: body.gstPercent ?? 0,
    referenceRange: body.referenceRange || null,
    turnaroundHours: body.turnaroundHours ?? 6,
    serviceCode: body.serviceCode || null,
    isInHouseTest: body.isInHouseTest ?? true,
    isVariableCharges: body.isVariableCharges ?? false,
    isListedAtPrescription: body.isListedAtPrescription ?? true,
    isCommissionable: body.isCommissionable ?? true,
    commissionMode: body.commissionMode || 'Percent',
    fixedCommissionAmount: body.fixedCommissionAmount ?? 0,
    commissionPercentOverride: body.commissionPercentOverride || null,
  };
}

// GET /api/tests?search=&departmentId=
router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', departmentId } = req.query;

  const conditions = ['t.hospital_id = $1', '(t.name ILIKE $2 OR t.code ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (departmentId) {
    params.push(departmentId);
    conditions.push(`t.department_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT t.*, d.name AS department_name, st.name AS sample_type_name, c.name AS container_name
     FROM tests t
     LEFT JOIN departments d ON d.id = t.department_id
     LEFT JOIN sample_types st ON st.id = t.sample_type_id
     LEFT JOIN containers c ON c.id = t.container_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.name ASC`,
    params
  );
  res.json({ tests: result.rows });
});

// GET /api/tests/autocomplete?q= - for booking/package pickers in later phases
router.get('/autocomplete', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { q = '' } = req.query;
  const result = await pool.query(
    `SELECT id, code, name, price FROM tests
     WHERE hospital_id = $1 AND is_active = TRUE AND (name ILIKE $2 OR code ILIKE $2)
     ORDER BY name ASC LIMIT 20`,
    [hospitalId, `%${q}%`]
  );
  res.json({ tests: result.rows });
});

// GET /api/tests/:id
router.get('/:id', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const testRes = await pool.query(
    `SELECT t.*, d.name AS department_name, st.name AS sample_type_name, c.name AS container_name
     FROM tests t
     LEFT JOIN departments d ON d.id = t.department_id
     LEFT JOIN sample_types st ON st.id = t.sample_type_id
     LEFT JOIN containers c ON c.id = t.container_id
     WHERE t.id = $1 AND t.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!testRes.rows[0]) return res.status(404).json({ message: 'Test not found.' });

  const bandsRes = await pool.query(`SELECT * FROM test_reference_bands WHERE test_id = $1 ORDER BY id ASC`, [id]);
  const componentsRes = await pool.query(
    `SELECT tc.*, t.name AS component_test_name, t.code AS component_test_code
     FROM test_components tc JOIN tests t ON t.id = tc.component_test_id
     WHERE tc.parent_test_id = $1 ORDER BY tc.display_order ASC`,
    [id]
  );

  res.json({ test: testRes.rows[0], referenceBands: bandsRes.rows, components: componentsRes.rows });
});

// POST /api/tests
router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const t = mapTestBody(req.body);
  const invalid = await validateTest(t, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  try {
    const result = await pool.query(
      `INSERT INTO tests (
         hospital_id, code, name, department_id, sample_type_id, container_id, price, actual_cost, gst_percent,
         reference_range, turnaround_hours, service_code, is_in_house_test, is_variable_charges,
         is_listed_at_prescription, is_commissionable, commission_mode, fixed_commission_amount, commission_percent_override
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        hospitalId, t.code, t.name, t.departmentId, t.sampleTypeId, t.containerId, t.price, t.actualCost, t.gstPercent,
        t.referenceRange, t.turnaroundHours, t.serviceCode, t.isInHouseTest, t.isVariableCharges,
        t.isListedAtPrescription, t.isCommissionable, t.commissionMode, t.fixedCommissionAmount, t.commissionPercentOverride,
      ]
    );
    await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Create Test', module: 'Laboratory', details: `${t.code} - ${t.name}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Test code already exists.' });
    throw err;
  }
});

// PUT /api/tests/:id
router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const t = mapTestBody(req.body);
  const invalid = await validateTest(t, hospitalId);
  if (invalid) return res.status(400).json({ message: invalid });

  try {
  const result = await pool.query(
    `UPDATE tests SET
       code=$1, name=$2, department_id=$3, sample_type_id=$4, container_id=$5, price=$6, actual_cost=$7, gst_percent=$8,
       reference_range=$9, turnaround_hours=$10, service_code=$11, is_in_house_test=$12, is_variable_charges=$13,
       is_listed_at_prescription=$14, is_commissionable=$15, commission_mode=$16, fixed_commission_amount=$17,
       commission_percent_override=$18
     WHERE id=$19 AND hospital_id=$20 RETURNING *`,
    [
      t.code, t.name, t.departmentId, t.sampleTypeId, t.containerId, t.price, t.actualCost, t.gstPercent,
      t.referenceRange, t.turnaroundHours, t.serviceCode, t.isInHouseTest, t.isVariableCharges,
      t.isListedAtPrescription, t.isCommissionable, t.commissionMode, t.fixedCommissionAmount,
      t.commissionPercentOverride, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Test not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Edit Test', module: 'Laboratory', details: `${t.code} - ${t.name}`, ip: req.ip });
  res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Test code already exists.' });
    throw err;
  }
});

// PATCH /api/tests/:id/active
router.patch('/:id/active', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });
  const result = await pool.query(`UPDATE tests SET is_active=$1 WHERE id=$2 AND hospital_id=$3 RETURNING *`, [isActive, id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Test not found.' });
  res.json(result.rows[0]);
});

// DELETE /api/tests/:id
router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  let result;
  try {
    result = await pool.query(`DELETE FROM tests WHERE id = $1 AND hospital_id = $2 RETURNING code, name`, [id, hospitalId]);
  } catch (err) {
    // A test that has been booked or billed is part of the record; retire it instead of deleting it.
    if (err.code === '23503') return res.status(409).json({ message: 'This test has bookings or invoices on record and cannot be deleted. Mark it inactive instead.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Test not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Delete Test', module: 'Laboratory', details: `${result.rows[0].code} - ${result.rows[0].name}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Test deleted.' });
});

// PUT /api/tests/:id/reference-bands { bands: [{gender, ageMin, ageMax, low, high, unit}] }
router.put('/:id/reference-bands', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { bands = [] } = req.body;

  if (!Array.isArray(bands) || bands.length > 100) return res.status(400).json({ message: 'Provide up to 100 reference bands.' });
  for (const [i, b] of bands.entries()) {
    const n = i + 1;
    if (b.gender !== undefined && !BAND_GENDERS.includes(b.gender)) return res.status(400).json({ message: `Band ${n}: invalid gender.` });
    if ((b.ageMin !== undefined && !isNonNegInt(b.ageMin)) || (b.ageMax !== undefined && !isNonNegInt(b.ageMax)) || Number(b.ageMin ?? 0) > Number(b.ageMax ?? 120) || Number(b.ageMax ?? 120) > 150) {
      return res.status(400).json({ message: `Band ${n}: ages must be whole numbers, with the minimum not above the maximum.` });
    }
    for (const k of ['low', 'high', 'unit']) {
      if (b[k] !== undefined && b[k] !== null && String(b[k]).length > 30) return res.status(400).json({ message: `Band ${n}: ${k} must be 30 characters or fewer.` });
    }
  }
  // The test must be this hospital's own before its bands are replaced.
  if (!(await idsBelongToHospital(pool, 'tests', hospitalId, [id]))) return res.status(404).json({ message: 'Test not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM test_reference_bands WHERE test_id = $1`, [id]);
    for (const b of bands) {
      if (!b.low && !b.high) continue; // skip blank rows, mirrors original's cleanup filter
      await client.query(
        `INSERT INTO test_reference_bands (test_id, gender, age_min, age_max, low, high, unit) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, b.gender || 'All', b.ageMin ?? 0, b.ageMax ?? 120, b.low, b.high, b.unit]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query(`SELECT * FROM test_reference_bands WHERE test_id = $1 ORDER BY id ASC`, [id]);
    res.json({ bands: result.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
