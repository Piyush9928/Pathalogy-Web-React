const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../db/pool');
const { logoDir, LOGO_TYPES } = require('../routes/branding.routes');

// Shared by the hospital's own Company Settings page and the developer console (onboarding / editing a hospital).
// PNG / JPG / WebP up to 512 KB. SVG is refused on purpose (it can carry scripts). The type is decided from the
// file's own bytes, not its name.
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024, files: 1 } });

function detectImageExt(buf) {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

function removeLogoFiles(hospitalId) {
  for (const ext of Object.keys(LOGO_TYPES)) fs.rmSync(path.join(logoDir, `${Number(hospitalId)}${ext}`), { force: true });
}

/** Stores the uploaded image for a hospital and points hospitals.logo_url at it. Returns { logoUrl } or { error }. */
async function saveHospitalLogo(hospitalId, file) {
  if (!file) return { error: 'Choose a PNG, JPG or WebP image.' };
  const ext = detectImageExt(file.buffer);
  if (!ext) return { error: 'Only PNG, JPG and WebP images are allowed.' };

  fs.mkdirSync(logoDir, { recursive: true });
  removeLogoFiles(hospitalId);
  fs.writeFileSync(path.join(logoDir, `${Number(hospitalId)}${ext}`), file.buffer);

  const logoUrl = `/api/branding/logo/${Number(hospitalId)}?v=${Date.now()}`; // ?v= busts the browser cache after a change
  await pool.query(`UPDATE hospitals SET logo_url = $1 WHERE id = $2`, [logoUrl, hospitalId]);
  return { logoUrl };
}

async function removeHospitalLogo(hospitalId) {
  removeLogoFiles(hospitalId);
  await pool.query(`UPDATE hospitals SET logo_url = NULL WHERE id = $1`, [hospitalId]);
}

module.exports = { logoUpload, saveHospitalLogo, removeHospitalLogo };
