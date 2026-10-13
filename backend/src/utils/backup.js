const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, '..', '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

// Only files this module generates: a plain name ending in .sql, no separators or dots-segments.
const SAFE_BACKUP_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.sql$/;

/**
 * Connection settings for pg_dump, taken from DATABASE_URL (what the app itself connects with, e.g. the
 * Neon cloud database) and handed over through environment variables so the password never appears in
 * the process list. Falls back to the standard PG* variables when DATABASE_URL is not set.
 */
function connectionEnv() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      PGHOST: u.hostname,
      PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
      PGSSLMODE: u.searchParams.get('sslmode') || 'require',
    };
  }
  return {
    PGHOST: process.env.PGHOST || 'localhost',
    PGPORT: String(process.env.PGPORT || 5432),
    PGUSER: process.env.PGUSER || 'postgres',
    PGPASSWORD: process.env.PGPASSWORD || '',
    PGDATABASE: process.env.PGDATABASE || 'labsyncpro',
  };
}

/**
 * Whole-database backup using pg_dump, shelled out as an external process - the Postgres equivalent of
 * the original's `BACKUP DATABASE ... TO DISK`. pg_dump must be installed and on PATH; if it is missing
 * this rejects with a clear error rather than silently doing nothing.
 *
 * This dumps EVERY hospital's data (the app is single-database, tenant_id per row), so it is a platform
 * operation: it is exposed only through the developer console, never to hospital users.
 */
function createDatabaseBackup() {
  return new Promise((resolve, reject) => {
    const conn = connectionEnv();
    const safeDb = conn.PGDATABASE.replace(/[^A-Za-z0-9_-]+/g, '_') || 'database';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `labsyncpro_${safeDb}_${timestamp}.sql`;
    const filePath = path.join(backupDir, fileName);

    // --no-owner/--no-privileges keep the dump restorable into a differently-named role (e.g. a fresh Neon project).
    const args = ['--format=plain', '--no-owner', '--no-privileges', '--file', filePath];

    const child = spawn('pg_dump', args, { env: { ...process.env, ...conn } });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        return reject(new Error('pg_dump is not installed or not on PATH. Install the PostgreSQL client tools to enable database backups.'));
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        fs.rmSync(filePath, { force: true }); // do not leave a truncated dump that looks like a valid backup
        return reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      }
      const stats = fs.statSync(filePath);
      resolve({ fileName, sizeBytes: stats.size, createdOn: new Date() });
    });
  });
}

function listBackups() {
  return fs.readdirSync(backupDir)
    .filter((f) => SAFE_BACKUP_NAME.test(f))
    .map((f) => {
      const stats = fs.statSync(path.join(backupDir, f));
      return { fileName: f, sizeBytes: stats.size, createdOn: stats.mtime };
    })
    .sort((a, b) => b.createdOn - a.createdOn);
}

function resolveBackup(fileName) {
  // Allow-list the name (no path separators, no ..) and then confirm the resolved path stays inside backupDir.
  if (typeof fileName !== 'string' || !SAFE_BACKUP_NAME.test(fileName) || fileName.includes('..')) {
    throw new Error('Invalid backup file name.');
  }
  const filePath = path.resolve(backupDir, fileName);
  if (path.dirname(filePath) !== path.resolve(backupDir)) throw new Error('Invalid backup file name.');
  if (!fs.existsSync(filePath)) throw new Error('Backup file not found.');
  return filePath;
}

function deleteBackup(fileName) {
  fs.unlinkSync(resolveBackup(fileName));
}

function getBackupPath(fileName) {
  return resolveBackup(fileName);
}

module.exports = { createDatabaseBackup, listBackups, deleteBackup, getBackupPath, backupDir, connectionEnv };
