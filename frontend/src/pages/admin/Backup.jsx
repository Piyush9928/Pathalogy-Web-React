import { useState } from 'react';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const CSV_TABLES = [
  { key: 'patients', label: 'Patients' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'tests', label: 'Tests' },
  { key: 'blood-units', label: 'Blood Units' },
];

// Downloads an authenticated file by fetching it with the bearer token and saving the blob.
async function downloadFile(path, fileName) {
  const token = localStorage.getItem('lsp.token');
  const res = await fetch(`${API_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let message = 'Export failed.';
    try { message = (await res.json()).message || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const [error, setError] = useState('');

  async function run(path, fileName) {
    setError('');
    try {
      await downloadFile(path, fileName);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      {error && <div className="auth-alert" role="alert">{error}</div>}

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-file-earmark-arrow-down" /></span> Data Export</h3>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          Export your hospital&apos;s data for backup or migration. These files contain only your own hospital&apos;s records.
          Whole-database backups are handled by the platform administrator.
        </p>
        <div className="d-flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline-secondary" type="button" onClick={() => run('/api/backup/export/json', `labsyncpro-export-${Date.now()}.json`)}>
            <i className="bi bi-filetype-json" /> Export All (JSON)
          </button>
          {CSV_TABLES.map((t) => (
            <button key={t.key} className="btn btn-outline-secondary" type="button" onClick={() => run(`/api/backup/export/csv/${t.key}`, `${t.key}.csv`)}>
              <i className="bi bi-filetype-csv" /> {t.label} (CSV)
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
