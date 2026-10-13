const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { UPLOAD_ROOT } = require('../config/paths');
const uploadDir = path.join(UPLOAD_ROOT, 'bloodbank', 'crossmatch');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto_randomUUID()}${ext}`);
  },
});

function crypto_randomUUID() {
  return require('crypto').randomUUID();
}

const crossMatchUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB, matches original's [RequestSizeLimit(20_000_000)]
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err = new Error('Only PDF, PNG, and JPG files are allowed.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = { crossMatchUpload, uploadDir };
