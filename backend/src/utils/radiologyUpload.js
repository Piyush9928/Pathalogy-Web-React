const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { UPLOAD_ROOT } = require('../config/paths');
const uploadDir = path.join(UPLOAD_ROOT, 'radiology');
fs.mkdirSync(uploadDir, { recursive: true });

// Matches the original's SaveUploadedFilesAsync allow-list exactly (.dcm/.dicom for real
// DICOM files, plus plain image formats for scanned printouts/photos of film).
const ALLOWED_EXTENSIONS = ['.dcm', '.dicom', '.png', '.jpg', '.jpeg'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // req.study is set by the route after it has confirmed the study belongs to the caller's hospital.
    // The folder name is built from that verified integer only - never from the raw URL text.
    if (!req.study || !Number.isInteger(req.study.id)) return cb(new Error('Upload not authorised.'));
    const studyDir = path.join(uploadDir, String(req.study.id));
    fs.mkdirSync(studyDir, { recursive: true });
    cb(null, studyDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const radiologyUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB, matches original's [RequestSizeLimit(200_000_000)]
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err = new Error('Only DICOM (.dcm/.dicom), PNG, and JPG files are allowed.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = { radiologyUpload, uploadDir };
