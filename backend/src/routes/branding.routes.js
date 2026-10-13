const express = require('express');
const fs = require('fs');
const path = require('path');

// Public (no login) on purpose: the logo is shown on the sign-in related screens and is not patient data.
// Only files that this module itself wrote into uploads/logos can be served: the hospital id must be numeric
// and the extension comes from a fixed allowlist, so no user-controlled path ever reaches the filesystem.
const router = express.Router();

const logoDir = path.join(__dirname, '..', '..', 'uploads', 'logos');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

router.get('/logo/:hospitalId', (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.hospitalId)) return res.status(404).json({ message: 'Logo not found.' });
  for (const [ext, type] of Object.entries(TYPES)) {
    const file = path.join(logoDir, `${Number(req.params.hospitalId)}${ext}`);
    if (fs.existsSync(file)) {
      res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // the app is served from another origin than the API
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.sendFile(file);
    }
  }
  return res.status(404).json({ message: 'Logo not found.' });
});

module.exports = { router, logoDir, LOGO_TYPES: TYPES };
