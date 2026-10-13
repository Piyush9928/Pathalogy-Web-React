const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isMoney, isNonNegInt, isPositiveInt, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['General', 'Semi-Private', 'Private', 'Deluxe', 'ICU'];
const BED_STATUSES = ['Available', 'Occupied', 'Reserved', 'Cleaning', 'Out of Service'];
// "Occupied" is only ever set by admitting a patient (and cleared by discharge/transfer). Setting it by hand
// would create a bed that looks full with nobody in it, or free a bed that still has a patient.
const MANUAL_BED_STATUSES = BED_STATUSES.filter((s) => s !== 'Occupied');
const MAX_BEDS_PER_WARD = 500;
const MAX_RATE = 99999999.99;

// Wards belong to a hospital; beds belong to a ward. Every bed lookup goes through its ward.
async function findWard(client, hospitalId, wardId) {
  if (!isPositiveInt(wardId)) return null;
  const res = await client.query(`SELECT * FROM wards WHERE id = $1 AND hospital_id = $2`, [wardId, hospitalId]);
  return res.rows[0] || null;
}

// GET /api/wards - includes bed counts/occupancy
router.get('/', requirePermission('ipd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT w.*,
       (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id) AS total_beds,
       (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'Occupied') AS occupied_beds
     FROM wards w WHERE w.hospital_id = $1 ORDER BY w.name ASC`,
    [hospitalId]
  );
  res.json({ wards: result.rows, categories: CATEGORIES });
});

router.post('/', requirePermission('ipd.create'), async (req, res) => {
  const { hospitalId, name: userName } = req.user;
  const { name, code, category, ratePerDay, bedCount } = req.body;
  if (!String(name || '').trim() || !String(code || '').trim()) return res.status(400).json({ message: 'Name and code are required.' });
  if (String(name).length > 100 || String(code).length > 20) return res.status(400).json({ message: 'Name must be 100 and code 20 characters or fewer.' });
  if (category !== undefined && !CATEGORIES.includes(category)) return res.status(400).json({ message: 'Invalid ward category.' });
  if (ratePerDay !== undefined && ratePerDay !== '' && !isMoney(ratePerDay, MAX_RATE)) return res.status(400).json({ message: 'Rate per day must be 0 or more.' });
  if (bedCount !== undefined && bedCount !== '' && (!isNonNegInt(bedCount) || Number(bedCount) > MAX_BEDS_PER_WARD)) {
    return res.status(400).json({ message: `Bed count must be a whole number from 0 to ${MAX_BEDS_PER_WARD}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wardRes = await client.query(
      `INSERT INTO wards (hospital_id, name, code, category, rate_per_day) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [hospitalId, String(name).trim(), String(code).trim(), category || 'General', ratePerDay || 0]
    );
    const ward = wardRes.rows[0];

    const count = Number(bedCount) || 0;
    for (let i = 1; i <= count; i++) {
      await client.query(`INSERT INTO beds (ward_id, bed_number) VALUES ($1, $2)`, [ward.id, String(i)]);
    }
    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName, role: req.user.role, action: 'Create Ward', module: 'IPD', details: `${ward.name} (${count} beds)`, ip: req.ip });
    res.status(201).json(ward);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ message: 'Ward code already exists.' });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;
  const { name, category, ratePerDay, isActive } = req.body;
  if (!String(name || '').trim() || String(name).length > 100) return res.status(400).json({ message: 'A ward name of up to 100 characters is required.' });
  if (category !== undefined && !CATEGORIES.includes(category)) return res.status(400).json({ message: 'Invalid ward category.' });
  if (ratePerDay !== undefined && ratePerDay !== '' && !isMoney(ratePerDay, MAX_RATE)) return res.status(400).json({ message: 'Rate per day must be 0 or more.' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be true or false.' });

  const result = await pool.query(
    `UPDATE wards SET name=$1, category=COALESCE($2, category), rate_per_day=COALESCE($3, rate_per_day), is_active=COALESCE($4, is_active)
     WHERE id=$5 AND hospital_id=$6 RETURNING *`,
    [String(name).trim(), category ?? null, ratePerDay === undefined || ratePerDay === '' ? null : ratePerDay, isActive ?? null, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Ward not found.' });
  res.json(result.rows[0]);
});

router.delete('/:id', requirePermission('ipd.delete'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const ward = await findWard(pool, hospitalId, id);
  if (!ward) return res.status(404).json({ message: 'Ward not found.' });

  const activeRes = await pool.query(
    `SELECT COUNT(*) FROM ipd_admissions a JOIN beds b ON b.id = a.bed_id WHERE b.ward_id = $1 AND a.status = 'Admitted'`,
    [id]
  );
  if (Number(activeRes.rows[0].count) > 0) return res.status(400).json({ message: 'Cannot delete a ward with active admissions.' });

  try {
    await pool.query(`DELETE FROM wards WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  } catch (err) {
    // Past admissions reference the ward's beds; keep that history instead of failing with a 500.
    if (err.code === '23503') return res.status(409).json({ message: 'This ward has admission history and cannot be deleted. Mark it inactive instead.' });
    throw err;
  }
  res.json({ message: 'Ward deleted.' });
});

// ==================== Beds ====================

router.get('/:wardId/beds', requirePermission('ipd.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { wardId } = req.params;
  if (!(await findWard(pool, hospitalId, wardId))) return res.status(404).json({ message: 'Ward not found.' });

  const result = await pool.query(`SELECT * FROM beds WHERE ward_id = $1 ORDER BY bed_number ASC`, [wardId]);
  res.json({ beds: result.rows, statuses: BED_STATUSES });
});

router.post('/:wardId/beds', requirePermission('ipd.create'), async (req, res) => {
  const { hospitalId } = req.user;
  const { wardId } = req.params;
  const { bedNumber } = req.body;
  if (!String(bedNumber || '').trim()) return res.status(400).json({ message: 'Bed number is required.' });
  if (String(bedNumber).length > 20) return res.status(400).json({ message: 'Bed number must be 20 characters or fewer.' });
  if (!(await findWard(pool, hospitalId, wardId))) return res.status(404).json({ message: 'Ward not found.' });

  try {
    const result = await pool.query(`INSERT INTO beds (ward_id, bed_number) VALUES ($1,$2) RETURNING *`, [wardId, String(bedNumber).trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Bed number already exists in this ward.' });
    throw err;
  }
});

router.patch('/beds/:bedId/status', requirePermission('ipd.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const { bedId } = req.params;
  const { status } = req.body;
  if (!BED_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid bed status.' });
  if (!MANUAL_BED_STATUSES.includes(status)) return res.status(400).json({ message: 'A bed becomes Occupied only by admitting a patient to it.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bedRes = await client.query(
      `SELECT b.* FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = $1 AND w.hospital_id = $2 FOR UPDATE OF b`,
      [isPositiveInt(bedId) ? bedId : 0, hospitalId]
    );
    const bed = bedRes.rows[0];
    if (!bed) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bed not found.' });
    }
    if (bed.status === 'Occupied') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This bed has a patient in it. Discharge or transfer the patient first.' });
    }
    const result = await client.query(`UPDATE beds SET status = $1 WHERE id = $2 RETURNING *`, [status, bedId]);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/wards/bed-board - the full visual board: every ward with its beds + current occupant
router.get('/bed-board/all', requirePermission('ipd.view'), async (req, res) => {
  const { hospitalId } = req.user;

  const wardsRes = await pool.query(`SELECT * FROM wards WHERE hospital_id = $1 AND is_active = TRUE ORDER BY name ASC`, [hospitalId]);
  const bedsRes = await pool.query(
    `SELECT b.*, w.name AS ward_name, w.category AS ward_category,
            a.id AS admission_id, a.admission_number, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     LEFT JOIN ipd_admissions a ON a.bed_id = b.id AND a.status = 'Admitted'
     LEFT JOIN patients p ON p.id = a.patient_id
     WHERE w.hospital_id = $1
     ORDER BY w.name ASC, b.bed_number ASC`,
    [hospitalId]
  );

  const bedsByWard = {};
  for (const bed of bedsRes.rows) {
    bedsByWard[bed.ward_id] = bedsByWard[bed.ward_id] || [];
    bedsByWard[bed.ward_id].push(bed);
  }

  res.json({
    wards: wardsRes.rows.map((w) => ({ ...w, beds: bedsByWard[w.id] || [] })),
  });
});

module.exports = router;
