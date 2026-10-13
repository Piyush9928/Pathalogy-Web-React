const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { isPositiveInt, tooLong, EMAIL_RE, PHONE_RE } = require('../utils/validate');
const { logoUpload, saveHospitalLogo, removeHospitalLogo } = require('../utils/logoStore');

const SYMBOLOGIES = ['Code128', 'Code39', 'QR', 'EAN13'];
const nn = (v) => (v === undefined || v === '' ? null : v); // "not sent" -> keep current value
const isBool = (v) => v === undefined || typeof v === 'boolean';

const router = express.Router();
router.use(requireAuth);

// GET /api/company-settings
router.get('/', requirePermission('settings.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM company_settings WHERE hospital_id = $1`, [hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Company settings not found.' });

  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM branches WHERE hospital_id = $1) AS branches,
       (SELECT COUNT(*) FROM users WHERE hospital_id = $1) AS users,
       (SELECT COUNT(*) FROM roles WHERE hospital_id = $1) AS roles,
       (SELECT COUNT(*) FROM audit_logs WHERE hospital_id = $1) AS audit_events`,
    [hospitalId]
  );

  res.json({ settings: result.rows[0], counts: counts.rows[0] });
});

// PUT /api/company-settings
router.put('/', requirePermission('settings.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  const s = req.body;

  const text = [['name', 200], ['legalName', 200], ['gstin', 20], ['nablNumber', 50], ['website', 150], ['address', 300], ['reportFooterNote', 500], ['upiId', 100], ['upiPayeeName', 150]];
  for (const [k, max] of text) {
    if (s[k] !== undefined && s[k] !== null && (typeof s[k] !== 'string' || s[k].length > max)) return res.status(400).json({ message: `${k} must be text of at most ${max} characters.` });
  }
  if (s.name !== undefined && !String(s.name || '').trim()) return res.status(400).json({ message: 'Company name cannot be empty.' });
  if (s.email && (!EMAIL_RE.test(String(s.email)) || tooLong(s.email, 150))) return res.status(400).json({ message: 'Email is invalid.' });
  if (s.phone && !PHONE_RE.test(String(s.phone))) return res.status(400).json({ message: 'Phone number is invalid.' });
  if (s.upiId && !/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/.test(s.upiId)) return res.status(400).json({ message: 'UPI id looks invalid (expected name@bank).' });
  if (s.defaultGstPercent !== undefined && s.defaultGstPercent !== '' && !(Number.isFinite(Number(s.defaultGstPercent)) && Number(s.defaultGstPercent) >= 0 && Number(s.defaultGstPercent) <= 100)) return res.status(400).json({ message: 'GST percent must be between 0 and 100.' });
  if (s.invoiceDueDays !== undefined && s.invoiceDueDays !== '' && !(isPositiveInt(s.invoiceDueDays) || Number(s.invoiceDueDays) === 0) ) return res.status(400).json({ message: 'Invoice due days must be a whole number.' });
  if (s.invoiceDueDays !== undefined && Number(s.invoiceDueDays) > 365) return res.status(400).json({ message: 'Invoice due days can be at most 365.' });
  if (s.barcodeNumberLength !== undefined && s.barcodeNumberLength !== '' && !(isPositiveInt(s.barcodeNumberLength) && Number(s.barcodeNumberLength) >= 4 && Number(s.barcodeNumberLength) <= 12)) return res.status(400).json({ message: 'Barcode number length must be between 4 and 12.' });
  if (s.barcodeSymbology && !SYMBOLOGIES.includes(s.barcodeSymbology)) return res.status(400).json({ message: 'Invalid barcode symbology.' });
  if ((s.uhidPrefix !== undefined && !/^[A-Za-z0-9-]{1,20}$/.test(String(s.uhidPrefix))) || (s.barcodePrefix !== undefined && !/^[A-Za-z0-9-]{1,20}$/.test(String(s.barcodePrefix)))) {
    return res.status(400).json({ message: 'UHID / barcode prefix must be 1-20 letters, digits or hyphens.' });
  }
  if (s.currency !== undefined && (typeof s.currency !== 'string' || s.currency.length < 1 || s.currency.length > 10)) return res.status(400).json({ message: 'Currency must be 1-10 characters.' });
  if (![s.enableEmailNotifications, s.enableSmsNotifications, s.enableWhatsappNotifications, s.printQrCodeOnLabel].every(isBool)) return res.status(400).json({ message: 'Notification / label switches must be true or false.' });

  // NOT NULL columns keep their current value when the field is not sent.
  const result = await pool.query(
    `UPDATE company_settings SET
       name=$1, legal_name=$2, gstin=$3, nabl_number=$4, email=$5, phone=$6, website=$7, address=$8,
       default_gst_percent=COALESCE($9, default_gst_percent), currency=COALESCE($10, currency), report_footer_note=$11,
       uhid_prefix=COALESCE($12, uhid_prefix), invoice_due_days=COALESCE($13, invoice_due_days),
       enable_email_notifications=COALESCE($14, enable_email_notifications), enable_sms_notifications=COALESCE($15, enable_sms_notifications),
       enable_whatsapp_notifications=COALESCE($16, enable_whatsapp_notifications),
       barcode_prefix=COALESCE($17, barcode_prefix), barcode_number_length=COALESCE($18, barcode_number_length),
       barcode_symbology=COALESCE($19, barcode_symbology), print_qr_code_on_label=COALESCE($20, print_qr_code_on_label),
       upi_id=$21, upi_payee_name=$22
     WHERE hospital_id = $23 RETURNING *`,
    [
      s.name === undefined ? null : s.name.trim(), s.legalName, s.gstin, s.nablNumber, s.email, s.phone, s.website, s.address,
      nn(s.defaultGstPercent), nn(s.currency), s.reportFooterNote, nn(s.uhidPrefix), nn(s.invoiceDueDays),
      nn(s.enableEmailNotifications), nn(s.enableSmsNotifications), nn(s.enableWhatsappNotifications),
      nn(s.barcodePrefix), nn(s.barcodeNumberLength), nn(s.barcodeSymbology), nn(s.printQrCodeOnLabel),
      s.upiId, s.upiPayeeName, hospitalId,
    ]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Company settings not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Update Company Settings', module: 'Settings', details: 'Updated company settings', ip: req.ip });
  res.json(result.rows[0]);
});

// ==================== Logo ====================
// POST /api/company-settings/logo  (multipart, field "logo") - PNG / JPG / WebP up to 512 KB (see utils/logoStore).
router.post('/logo', requirePermission('settings.edit'), logoUpload.single('logo'), async (req, res) => {
  const { hospitalId } = req.user;
  const saved = await saveHospitalLogo(hospitalId, req.file);
  if (saved.error) return res.status(400).json({ message: saved.error });
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Update Logo', module: 'Settings', details: 'Hospital logo changed', ip: req.ip });
  res.json({ logoUrl: saved.logoUrl });
});

router.delete('/logo', requirePermission('settings.edit'), async (req, res) => {
  const { hospitalId } = req.user;
  await removeHospitalLogo(hospitalId);
  await writeAudit({ hospitalId, userId: req.user.userId, userName: req.user.name, role: req.user.role, action: 'Remove Logo', module: 'Settings', details: 'Hospital logo removed', ip: req.ip });
  res.json({ logoUrl: null });
});

module.exports = router;
