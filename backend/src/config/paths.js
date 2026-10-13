const path = require('path');

// Where uploaded files (radiology images, cross-match reports, hospital logos) are stored.
// On a host with a persistent disk (e.g. a Render disk) set UPLOAD_DIR to the mount path, otherwise files are
// written next to the code and are lost whenever the host rebuilds or replaces the instance.
const UPLOAD_ROOT = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', '..', 'uploads');

module.exports = { UPLOAD_ROOT };
