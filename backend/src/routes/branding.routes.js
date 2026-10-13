const express = require('express');
const fs = require('fs');
const path = require('path');

// Public (no login) on purpose: the logo is shown on the sign-in related screens and is not patient data.
// Only files that this module itself wrote into uploads/logos can be served: the hospital id must be numeric
// and the extension comes from a fixed allowlist, so no user-controlled path ever reaches the filesystem.
const pool = require('../db/pool');

const router = express.Router();

const { UPLOAD_ROOT } = require('../config/paths');

const logoDir = path.join(UPLOAD_ROOT, 'logos');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function sendLogo(res, hospitalId) {
  for (const [ext, type] of Object.entries(TYPES)) {
    const file = path.join(logoDir, `${hospitalId}${ext}`);
    if (fs.existsSync(file)) {
      res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // the app is served from another origin than the API
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.sendFile(file);
    }
  }
  return res.status(404).json({ message: 'Logo not found.' });
}

router.get('/logo/:hospitalId', (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.hospitalId)) return res.status(404).json({ message: 'Logo not found.' });
  return sendLogo(res, Number(req.params.hospitalId));
});

// GET /api/branding/by-code/:code/logo - lets the sign-in page show the hospital's logo once a hospital code is typed.
// Returns only the image (or 404), never the hospital's details.
router.get('/by-code/:code/logo', async (req, res) => {
  if (!/^[A-Za-z0-9]{3,30}$/.test(req.params.code)) return res.status(404).json({ message: 'Logo not found.' });
  const found = await pool.query(`SELECT id FROM hospitals WHERE UPPER(code) = UPPER($1) AND logo_url IS NOT NULL`, [req.params.code]);
  if (!found.rows[0]) return res.status(404).json({ message: 'Logo not found.' });
  return sendLogo(res, found.rows[0].id);
});

module.exports = { router, logoDir, LOGO_TYPES: TYPES };
