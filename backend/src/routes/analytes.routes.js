const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { isPositiveInt, isNonNegInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

router.param('id', (req, res, next, id) => (isPositiveInt(id) ? next() : res.status(404).json({ message: 'Analyte not found.' })));

const RESULT_TYPES = ['Numeric', 'Text', 'Dropdown', 'Boolean'];
const BAND_GENDERS = ['All', 'Male', 'Female', 'Child'];
const isFiniteNumber = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

// Returns a message when the analyte is invalid, otherwise null. Critical limits drive the "Critical" result flag,
// so they must be real numbers and in the right order.
function validateAnalyte(a) {
  if (!String(a.analyteCode || '').trim() || !String(a.analyteName || '').trim() || !String(a.category || '').trim()) {
    return 'Code, name, and category are required.';
  }
  if (!RESULT_TYPES.includes(a.resultType)) return 'Invalid result type.';
  for (const [label, v, max] of [['Code', a.analyteCode, 30], ['Name', a.analyteName, 200], ['Short name', a.shortName, 50], ['Category', a.category, 100],
    ['Unit', a.unit, 50], ['Reference range', a.referenceRange, 200], ['Allowed values', a.predefinedValues, 500], ['Sample type', a.sampleType, 100],
    ['Method', a.method, 150], ['Notes', a.notes, 1000]]) {
    if (v && String(v).length > max) return `${label} must be ${max} characters or fewer.`;
  }
  for (const [label, v] of [['Critical low', a.criticalLow], ['Critical high', a.criticalHigh]]) {
    if (v !== null && (!isFiniteNumber(v) || Math.abs(Number(v)) > 99999999)) return `${label} must be a number.`;
  }
  if (a.criticalLow !== null && a.criticalHigh !== null && Number(a.criticalLow) > Number(a.criticalHigh)) return 'Critical low cannot be above critical high.';
  if (a.resultType === 'Dropdown' && !String(a.predefinedValues || '').trim()) return 'A dropdown analyte needs its allowed values.';
  if (typeof a.isCommon !== 'boolean') return 'isCommon must be true or false.';
  if (!isNonNegInt(a.displayOrder)) return 'Display order must be a whole number, 0 or more.';
  return null;
}

function mapAnalyteBody(body) {
  return {
    analyteCode: body.analyteCode,
    analyteName: body.analyteName,
    shortName: body.shortName || null,
    category: body.category,
    unit: body.unit || null,
    referenceRange: body.referenceRange || null,
    // 0 is a legitimate critical limit, so only "empty" means "not set" (the old `|| null` turned 0 into null).
    criticalLow: body.criticalLow === undefined || body.criticalLow === null || body.criticalLow === '' ? null : body.criticalLow,
    criticalHigh: body.criticalHigh === undefined || body.criticalHigh === null || body.criticalHigh === '' ? null : body.criticalHigh,
    resultType: body.resultType || 'Numeric',
    predefinedValues: body.predefinedValues || null,
    sampleType: body.sampleType || null,
    method: body.method || null,
    isCommon: body.isCommon ?? true,
    displayOrder: body.displayOrder ?? 0,
    notes: body.notes || null,
  };
}

// GET /api/analytes?search=&category=
router.get('/', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', category = '' } = req.query;

  const conditions = ['hospital_id = $1', '(analyte_name ILIKE $2 OR analyte_code ILIKE $2 OR short_name ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT * FROM analytes WHERE ${conditions.join(' AND ')} ORDER BY category ASC, display_order ASC, analyte_name ASC`,
    params
  );

  const categoriesRes = await pool.query(
    `SELECT DISTINCT category FROM analytes WHERE hospital_id = $1 ORDER BY category ASC`,
    [hospitalId]
  );

  res.json({ analytes: result.rows, categories: categoriesRes.rows.map((r) => r.category), resultTypes: RESULT_TYPES });
});

// GET /api/analytes/:id
router.get('/:id', requirePermission('tests.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const analyteRes = await pool.query(`SELECT * FROM analytes WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!analyteRes.rows[0]) return res.status(404).json({ message: 'Analyte not found.' });

  const bandsRes = await pool.query(`SELECT * FROM analyte_reference_bands WHERE analyte_id = $1 ORDER BY id ASC`, [id]);
  res.json({ analyte: analyteRes.rows[0], referenceBands: bandsRes.rows });
});

// POST /api/analytes
router.post('/', requirePermission('tests.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const a = mapAnalyteBody(req.body);
  const invalid = validateAnalyte(a);
  if (invalid) return res.status(400).json({ message: invalid });

  try {
    const result = await pool.query(
      `INSERT INTO analytes (
         hospital_id, analyte_code, analyte_name, short_name, category, unit, reference_range,
         critical_low, critical_high, result_type, predefined_values, sample_type, method,
         is_common, display_order, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        hospitalId, a.analyteCode, a.analyteName, a.shortName, a.category, a.unit, a.referenceRange,
        a.criticalLow, a.criticalHigh, a.resultType, a.predefinedValues, a.sampleType, a.method,
        a.isCommon, a.displayOrder, a.notes,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Analyte code already exists.' });
    throw err;
  }
});

// PUT /api/analytes/:id
router.put('/:id', requirePermission('tests.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const a = mapAnalyteBody(req.body);
  const invalid = validateAnalyte(a);
  if (invalid) return res.status(400).json({ message: invalid });

  try {
  const result = await pool.query(
    `UPDATE analytes SET
       analyte_code=$1, analyte_name=$2, short_name=$3, category=$4, unit=$5, reference_range=$6,
       critical_low=$7, critical_high=$8, result_type=$9, predefined_values=$10, sample_type=$11, method=$12,
       is_common=$13, display_order=$14, notes=$15
     WHERE id=$16 AND hospital_id=$17 RETURNING *`,
    [
      a.analyteCode, a.analyteName, a.shortName, a.category, a.unit, a.referenceRange,
      a.criticalLow, a.criticalHigh, a.resultType, a.predefinedValues, a.sampleType, a.method,
      a.isCommon, a.displayOrder, a.notes, id, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Analyte not found.' });
  res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Analyte code already exists.' });
    throw err;
  }
});

// DELETE /api/analytes/:id
router.delete('/:id', requirePermission('tests.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  let result;
  try {
    result = await pool.query(`DELETE FROM analytes WHERE id = $1 AND hospital_id = $2 RETURNING analyte_name`, [id, hospitalId]);
  } catch (err) {
    // Reported results point at the analyte; keep that history.
    if (err.code === '23503') return res.status(409).json({ message: 'This analyte is used in reported results and cannot be deleted.' });
    throw err;
  }
  if (!result.rows[0]) return res.status(404).json({ message: 'Analyte not found.' });
  res.json({ message: 'Analyte deleted.' });
});

// PUT /api/analytes/:id/reference-bands
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
    // Flagging compares results to these limits as numbers, so a band that is not numeric would silently never flag anything.
    if (!b.low && !b.high) continue;
    if ((b.low && !isFiniteNumber(b.low)) || (b.high && !isFiniteNumber(b.high)) || (b.low && b.high && Number(b.low) > Number(b.high))) {
      return res.status(400).json({ message: `Band ${n}: low and high must be numbers, with low not above high.` });
    }
  }
  // The analyte must be this hospital's own before its bands are replaced.
  if (!(await idsBelongToHospital(pool, 'analytes', hospitalId, [id]))) return res.status(404).json({ message: 'Analyte not found.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM analyte_reference_bands WHERE analyte_id = $1`, [id]);
    for (const b of bands) {
      if (!b.low && !b.high) continue;
      await client.query(
        `INSERT INTO analyte_reference_bands (analyte_id, gender, age_min, age_max, low, high) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, b.gender || 'All', b.ageMin ?? 0, b.ageMax ?? 120, b.low, b.high]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query(`SELECT * FROM analyte_reference_bands WHERE analyte_id = $1 ORDER BY id ASC`, [id]);
    res.json({ bands: result.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
