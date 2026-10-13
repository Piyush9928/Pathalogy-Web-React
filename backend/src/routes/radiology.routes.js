const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { radiologyUpload, uploadDir } = require('../utils/radiologyUpload');
const { computeInvoiceTotals } = require('../utils/billing');
const { isPositiveInt, isDateString, idsBelongToHospital } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// Study, image and echo-report ids in a URL must be positive integers.
for (const param of ['id', 'studyId', 'imageId']) {
  router.param(param, (req, res, next, value) => (isPositiveInt(value) ? next() : res.status(404).json({ message: 'Not found.' })));
}

const MODALITIES = ['X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'Mammography', 'Other'];
const STATUSES = ['Uploaded', 'Reported'];
// Keyword list retained only as a UI hint (Create form nudges users the same way the
// original did); is_cardiac_study is now a real stored flag, not re-derived from this list.
const CARDIAC_KEYWORDS = ['echo', 'doppler', 'cardiac', '2d echo', 'color doppler'];

async function generateAccessionNumber(client, studyId, studyDate) {
  const d = new Date(studyDate || new Date());
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `RAD-${datePart}-${String(studyId).padStart(4, '0')}`;
}

// Images are streamed by an authenticated route, so the "url" is an API path (the client must send its token),
// and the on-disk path is never exposed.
function toFileUrl(image) {
  const { file_path: _filePath, ...rest } = image; // eslint-disable-line no-unused-vars
  return { ...rest, url: `/api/radiology/images/${image.id}/file` };
}

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
// Optional numeric field: empty is fine; otherwise it must be a number inside [min, max]. (0 is a real value.)
const inRange = (v, min, max) => v === undefined || v === null || v === '' || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max);

// ==================== Studies ====================

// GET /api/radiology/studies?search=&status=&cardiacOnly=
router.get('/studies', requirePermission('radiology.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', status = '', cardiacOnly = '' } = req.query;

  const conditions = ['rs.hospital_id = $1'];
  const params = [hospitalId];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(rs.accession_number ILIKE $${params.length} OR p.full_name ILIKE $${params.length} OR rs.walk_in_patient_name ILIKE $${params.length} OR p.uhid ILIKE $${params.length})`);
  }
  if (status) { params.push(status); conditions.push(`rs.status = $${params.length}`); }
  if (cardiacOnly === 'true') conditions.push('rs.is_cardiac_study = TRUE');

  const result = await pool.query(
    `SELECT rs.*, p.full_name AS patient_name, p.uhid AS patient_uhid,
            (SELECT COUNT(*) FROM radiology_images ri WHERE ri.study_id = rs.id) AS image_count
     FROM radiology_studies rs
     LEFT JOIN patients p ON p.id = rs.patient_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY rs.study_date DESC`,
    params
  );

  const rows = result.rows;
  res.json({
    studies: rows,
    modalities: MODALITIES,
    statuses: STATUSES,
    stats: {
      total: rows.length,
      awaitingFindings: rows.filter((r) => r.status === 'Uploaded').length,
      reported: rows.filter((r) => r.status === 'Reported').length,
    },
  });
});

router.get('/studies/:id', requirePermission('radiology.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const studyRes = await pool.query(
    `SELECT rs.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age,
            d.full_name AS referring_doctor_name, u.full_name AS reported_by_name
     FROM radiology_studies rs
     LEFT JOIN patients p ON p.id = rs.patient_id
     LEFT JOIN doctors d ON d.id = rs.referring_doctor_id
     LEFT JOIN users u ON u.id = rs.reported_by_user_id
     WHERE rs.id = $1 AND rs.hospital_id = $2`,
    [id, hospitalId]
  );
  if (!studyRes.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });

  const imagesRes = await pool.query(`SELECT * FROM radiology_images WHERE study_id = $1 ORDER BY uploaded_on ASC`, [id]);
  res.json({ ...studyRes.rows[0], images: imagesRes.rows.map(toFileUrl) });
});

// POST /api/radiology/studies { patientId?, walkInPatientName?, bookingId?, modality, bodyPart,
//   isCardiacStudy?, referredBy?, referringDoctorId?, studyDate? }
router.post('/studies', requirePermission('radiology.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const b = req.body;

  if (!b.patientId && !b.walkInPatientName) {
    return res.status(400).json({ message: 'Select a registered patient or enter a walk-in patient name.' });
  }
  if (!String(b.bodyPart || '').trim()) return res.status(400).json({ message: 'Body part / study description is required.' });
  if (String(b.bodyPart).length > 200) return res.status(400).json({ message: 'Body part must be 200 characters or fewer.' });
  if (b.modality !== undefined && !MODALITIES.includes(b.modality)) return res.status(400).json({ message: 'Invalid modality.' });
  if (b.walkInPatientName && String(b.walkInPatientName).length > 150) return res.status(400).json({ message: 'Walk-in name must be 150 characters or fewer.' });
  if (b.referredBy && String(b.referredBy).length > 150) return res.status(400).json({ message: 'Referred-by must be 150 characters or fewer.' });
  if (b.studyDate && !isDateString(b.studyDate)) return res.status(400).json({ message: 'Study date is not valid.' });
  if (b.isCardiacStudy !== undefined && typeof b.isCardiacStudy !== 'boolean') return res.status(400).json({ message: 'isCardiacStudy must be true or false.' });
  for (const k of ['patientId', 'bookingId', 'referringDoctorId']) {
    if (b[k] && !isPositiveInt(b[k])) return res.status(400).json({ message: `Invalid ${k}.` });
  }
  // Patient, booking and referring doctor ids are global serials: they must be this hospital's own.
  if (b.patientId && !(await idsBelongToHospital(pool, 'patients', hospitalId, [b.patientId]))) return res.status(404).json({ message: 'Patient not found.' });
  if (b.referringDoctorId && !(await idsBelongToHospital(pool, 'doctors', hospitalId, [b.referringDoctorId]))) return res.status(404).json({ message: 'Referring doctor not found.' });
  if (b.bookingId) {
    const bk = await pool.query(`SELECT patient_id FROM bookings WHERE id = $1 AND hospital_id = $2`, [b.bookingId, hospitalId]);
    if (!bk.rows[0]) return res.status(404).json({ message: 'Booking not found.' });
    if (b.patientId && bk.rows[0].patient_id !== Number(b.patientId)) return res.status(400).json({ message: 'That booking belongs to a different patient.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isCardiac = b.isCardiacStudy ?? CARDIAC_KEYWORDS.some((k) => (b.bodyPart || '').toLowerCase().includes(k));

    const inserted = await client.query(
      `INSERT INTO radiology_studies (
         hospital_id, accession_number, patient_id, walk_in_patient_name, booking_id,
         modality, body_part, is_cardiac_study, referred_by, referring_doctor_id, study_date, created_by
       ) VALUES ($1,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        hospitalId, b.patientId || null, b.walkInPatientName || null, b.bookingId || null,
        b.modality || MODALITIES[0], b.bodyPart, isCardiac, b.referredBy || null, b.referringDoctorId || null,
        b.studyDate || new Date(), name,
      ]
    );
    const study = inserted.rows[0];

    const accessionNumber = await generateAccessionNumber(client, study.id, study.study_date);
    const finalRes = await client.query(`UPDATE radiology_studies SET accession_number = $1 WHERE id = $2 RETURNING *`, [accessionNumber, study.id]);

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Radiology Study', module: 'Radiology', details: accessionNumber, ip: req.ip });
    res.status(201).json(finalRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/radiology/studies/:id/findings { findings }
router.put('/studies/:id/findings', requirePermission('radiology.report'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { findings } = req.body;
  if (typeof findings !== 'string' || !findings.trim()) return res.status(400).json({ message: 'Findings text is required.' });
  if (findings.length > 20000) return res.status(400).json({ message: 'Findings must be 20,000 characters or fewer.' });

  const result = await pool.query(
    `UPDATE radiology_studies SET findings = $1, status = 'Reported', reported_by_user_id = $2, reported_on = NOW()
     WHERE id = $3 AND hospital_id = $4 RETURNING *`,
    [findings, req.user.userId, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Report Radiology Findings', module: 'Radiology', details: result.rows[0].accession_number, ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Images ====================

// POST /api/radiology/studies/:id/images (multipart, field name "files", up to 10)
// The study must exist in the caller's hospital BEFORE multer touches the disk. (Previously the file was written first
// and ownership was checked afterwards, so any user could fill the disk, or - via a crafted id - write outside uploads.)
async function requireOwnStudy(req, res, next) {
  const study = await pool.query(`SELECT * FROM radiology_studies WHERE id = $1 AND hospital_id = $2`, [req.params.id, req.user.hospitalId]);
  if (!study.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });
  req.study = study.rows[0];
  return next();
}

router.post('/studies/:id/images', requirePermission('radiology.upload'), requireOwnStudy, radiologyUpload.array('files', 10), async (req, res) => {
  const { hospitalId, name } = req.user;
  const id = req.study.id;
  const studyRes = { rows: [req.study] };

  if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'No files were uploaded.' });

  const inserted = [];
  try {
    for (const file of req.files) {
      const result = await pool.query(
        `INSERT INTO radiology_images (study_id, file_name, file_path, size_bytes) VALUES ($1,$2,$3,$4) RETURNING *`,
        [id, file.filename, file.path, file.size]
      );
      inserted.push(result.rows[0]);
    }
  } catch (err) {
    // Do not leave files on disk that no database row points at.
    for (const file of req.files) fs.rmSync(file.path, { force: true });
    throw err;
  }

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Upload Radiology Images', module: 'Radiology', details: `${studyRes.rows[0].accession_number}: ${inserted.length} file(s)`, ip: req.ip });
  res.status(201).json({ images: inserted.map(toFileUrl) });
});

// GET /api/radiology/images/:imageId/file - the image itself, for this hospital's users only.
router.get('/images/:imageId/file', requirePermission('radiology.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(
    `SELECT ri.* FROM radiology_images ri JOIN radiology_studies rs ON rs.id = ri.study_id
     WHERE ri.id = $1 AND rs.hospital_id = $2`,
    [req.params.imageId, hospitalId]
  );
  const image = result.rows[0];
  if (!image) return res.status(404).json({ message: 'Image not found.' });

  // Defence in depth: only ever send a file that really lives inside the radiology upload folder.
  const resolved = path.resolve(image.file_path);
  if (path.dirname(path.dirname(resolved)) !== path.resolve(uploadDir) || !fs.existsSync(resolved)) {
    return res.status(404).json({ message: 'Image file not found.' });
  }
  const ext = path.extname(resolved).toLowerCase();
  const viewable = ['.png', '.jpg', '.jpeg'].includes(ext);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${viewable ? 'inline' : 'attachment'}; filename="${path.basename(resolved)}"`);
  if (!viewable) res.type('application/octet-stream');
  return res.sendFile(resolved);
});

// DELETE /api/radiology/studies/:id/images/:imageId
router.delete('/studies/:id/images/:imageId', requirePermission('radiology.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id, imageId } = req.params;

  const studyRes = await pool.query(`SELECT * FROM radiology_studies WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!studyRes.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });

  const imageRes = await pool.query(`DELETE FROM radiology_images WHERE id = $1 AND study_id = $2 RETURNING *`, [imageId, id]);
  if (!imageRes.rows[0]) return res.status(404).json({ message: 'Image not found.' });

  // Best-effort physical file delete, matches the original's try/catch-and-continue behavior.
  try { fs.unlinkSync(imageRes.rows[0].file_path); } catch { /* ignore missing file */ }

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Radiology Image', module: 'Radiology', details: `${studyRes.rows[0].accession_number}: ${imageRes.rows[0].file_name}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Image deleted.' });
});

// ==================== Echo Worklist & Reports ====================

// GET /api/radiology/echo/worklist?includeCompleted=
router.get('/echo/worklist', requirePermission('radiology.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { includeCompleted = 'true' } = req.query;

  const conditions = ['rs.hospital_id = $1', 'rs.is_cardiac_study = TRUE'];
  const params = [hospitalId];
  if (includeCompleted !== 'true') conditions.push(`rs.status != 'Reported'`);

  const result = await pool.query(
    `SELECT rs.*, p.full_name AS patient_name, p.uhid AS patient_uhid
     FROM radiology_studies rs
     LEFT JOIN patients p ON p.id = rs.patient_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY rs.study_date DESC`,
    params
  );
  const rows = result.rows;

  // Due amount is a read-only display figure pulled from Billing (matches the original's
  // EchoWorklistRow.DueAmount) - invoice totals aren't stored columns, so compute them the
  // same way invoices.routes.js does rather than duplicating the formula in raw SQL.
  const dueByPatient = new Map();
  const patientIds = [...new Set(rows.map((r) => r.patient_id).filter(Boolean))];
  if (patientIds.length > 0) {
    const invoicesRes = await pool.query(
      `SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid_amount
       FROM invoices i WHERE i.hospital_id = $1 AND i.patient_id = ANY($2::int[])`,
      [hospitalId, patientIds]
    );
    for (const inv of invoicesRes.rows) {
      const { balanceDue } = computeInvoiceTotals(inv, inv.paid_amount);
      dueByPatient.set(inv.patient_id, (dueByPatient.get(inv.patient_id) || 0) + balanceDue);
    }
  }

  res.json({
    worklist: rows.map((r) => ({ ...r, isCompleted: r.status === 'Reported', dueAmount: dueByPatient.get(r.patient_id) || 0 })),
    stats: {
      pending: rows.filter((r) => r.status !== 'Reported').length,
      completed: rows.filter((r) => r.status === 'Reported').length,
    },
  });
});

router.get('/echo/reports/:studyId', requirePermission('radiology.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { studyId } = req.params;

  const studyRes = await pool.query(
    `SELECT rs.*, p.full_name AS patient_name, p.uhid AS patient_uhid, p.gender, p.age
     FROM radiology_studies rs LEFT JOIN patients p ON p.id = rs.patient_id
     WHERE rs.id = $1 AND rs.hospital_id = $2`,
    [studyId, hospitalId]
  );
  if (!studyRes.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });

  const reportRes = await pool.query(`SELECT * FROM echo_reports WHERE study_id = $1`, [studyId]);
  res.json({ study: studyRes.rows[0], report: reportRes.rows[0] || null });
});

// PUT /api/radiology/echo/reports/:studyId - upsert the structured echo report
router.put('/echo/reports/:studyId', requirePermission('radiology.report'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { studyId } = req.params;
  const b = req.body;

  const studyRes = await pool.query(`SELECT * FROM radiology_studies WHERE id = $1 AND hospital_id = $2`, [studyId, hospitalId]);
  if (!studyRes.rows[0]) return res.status(404).json({ message: 'Radiology study not found.' });

  // Measurements are stored as numbers; ranges are plausibility limits that catch typos (an EF of 650, a heart rate of 7).
  const checks = [
    ['LVIDd', b.lvidd, 0, 20], ['LVIDs', b.lvids, 0, 20], ['IVSd', b.ivsd, 0, 10], ['PWd', b.pwd, 0, 10],
    ['LA diameter', b.laDiameter, 0, 15], ['Aortic root', b.aorticRoot, 0, 15],
    ['Ejection fraction', b.ejectionFraction, 0, 100], ['Fractional shortening', b.fractionalShortening, 0, 100], ['Heart rate', b.heartRate, 20, 300],
  ];
  for (const [label, v, min, max] of checks) {
    if (!inRange(v, min, max)) return res.status(400).json({ message: `${label} must be a number between ${min} and ${max}.` });
  }
  if (b.heartRate !== undefined && b.heartRate !== null && b.heartRate !== '' && !Number.isInteger(Number(b.heartRate))) {
    return res.status(400).json({ message: 'Heart rate must be a whole number.' });
  }
  for (const k of ['leftVentricleFinding', 'rightVentricleFinding', 'leftAtriumFinding', 'rightAtriumFinding', 'mitralValveFinding', 'aorticValveFinding',
    'tricuspidValveFinding', 'pulmonaryValveFinding', 'pericardiumFinding', 'colorDopplerFinding']) {
    if (b[k] && String(b[k]).length > 500) return res.status(400).json({ message: 'Each finding must be 500 characters or fewer.' });
  }
  if (b.regionalWallMotion && String(b.regionalWallMotion).length > 200) return res.status(400).json({ message: 'Regional wall motion must be 200 characters or fewer.' });
  if (b.impression && String(b.impression).length > 10000) return res.status(400).json({ message: 'Impression is too long.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO echo_reports (
         study_id, lvidd, lvids, ivsd, pwd, la_diameter, aortic_root, ejection_fraction, fractional_shortening, heart_rate,
         left_ventricle_finding, right_ventricle_finding, left_atrium_finding, right_atrium_finding,
         mitral_valve_finding, aortic_valve_finding, tricuspid_valve_finding, pulmonary_valve_finding,
         pericardium_finding, regional_wall_motion, color_doppler_finding, impression, reported_by_user_id, reported_on
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
       ON CONFLICT (study_id) DO UPDATE SET
         lvidd=EXCLUDED.lvidd, lvids=EXCLUDED.lvids, ivsd=EXCLUDED.ivsd, pwd=EXCLUDED.pwd,
         la_diameter=EXCLUDED.la_diameter, aortic_root=EXCLUDED.aortic_root,
         ejection_fraction=EXCLUDED.ejection_fraction, fractional_shortening=EXCLUDED.fractional_shortening,
         heart_rate=EXCLUDED.heart_rate, left_ventricle_finding=EXCLUDED.left_ventricle_finding,
         right_ventricle_finding=EXCLUDED.right_ventricle_finding, left_atrium_finding=EXCLUDED.left_atrium_finding,
         right_atrium_finding=EXCLUDED.right_atrium_finding, mitral_valve_finding=EXCLUDED.mitral_valve_finding,
         aortic_valve_finding=EXCLUDED.aortic_valve_finding, tricuspid_valve_finding=EXCLUDED.tricuspid_valve_finding,
         pulmonary_valve_finding=EXCLUDED.pulmonary_valve_finding, pericardium_finding=EXCLUDED.pericardium_finding,
         regional_wall_motion=EXCLUDED.regional_wall_motion, color_doppler_finding=EXCLUDED.color_doppler_finding,
         impression=EXCLUDED.impression, reported_by_user_id=EXCLUDED.reported_by_user_id, reported_on=NOW()
       RETURNING *`,
      [
        studyId, num(b.lvidd), num(b.lvids), num(b.ivsd), num(b.pwd), num(b.laDiameter), num(b.aorticRoot),
        num(b.ejectionFraction), num(b.fractionalShortening), num(b.heartRate),
        b.leftVentricleFinding || null, b.rightVentricleFinding || null, b.leftAtriumFinding || null, b.rightAtriumFinding || null,
        b.mitralValveFinding || null, b.aorticValveFinding || null, b.tricuspidValveFinding || null, b.pulmonaryValveFinding || null,
        b.pericardiumFinding || null, b.regionalWallMotion || 'Normal', b.colorDopplerFinding || null, b.impression || null,
        req.user.userId,
      ]
    );

    // Same single-step "save = reported" workflow as the original's plain Radiology findings save.
    await client.query(`UPDATE radiology_studies SET status = 'Reported', reported_by_user_id = $1, reported_on = NOW() WHERE id = $2`, [req.user.userId, studyId]);

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Save Echo Report', module: 'Radiology', details: studyRes.rows[0].accession_number, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
