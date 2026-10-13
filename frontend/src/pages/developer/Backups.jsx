import { useEffect, useState } from 'react';
import { developerApi, getSession } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function Backups() {
  const [backups, setBackups] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await developerApi.get('/developer/backups');
      setBackups(res.data.backups);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load backups.');
    }
  }
  useEffect(() => { load(); }, []);

  async function createBackup() {
    setError('');
    setMessage('');
    setCreating(true);
    try {
      const res = await developerApi.post('/developer/backups');
      setMessage(`Backup created: ${res.data.fileName} (${formatSize(res.data.sizeBytes)}).`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create the backup.');
    } finally {
      setCreating(false);
    }
  }

  async function download(fileName) {
    setError('');
    try {
      const res = await fetch(`${API_ORIGIN}/api/developer/backups/${encodeURIComponent(fileName)}/download`, {
        headers: { Authorization: `Bearer ${getSession('developer')?.token}` },
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Download failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(fileName) {
    if (!window.confirm(`Delete backup "${fileName}"? This cannot be undone.`)) return;
    setError('');
    try {
      await developerApi.delete(`/developer/backups/${encodeURIComponent(fileName)}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the backup.');
    }
  }

  return (
    <>
      <PageHeader
        title="Database Backups"
        subtitle="Full backups of the shared database. They contain every hospital's data, so keep the files secure."
        actions={(
          <button className="btn btn-primary" type="button" onClick={createBackup} disabled={creating}>
            <i className="bi bi-hdd-fill" /> {creating ? 'Creating backup...' : 'Create backup now'}
          </button>
        )}
      />
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {message && <div className="otp-hint" role="status" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="lsp-panel">
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
          Runs <code>pg_dump</code> using the server&apos;s <code>DATABASE_URL</code> and saves a plain-SQL file on the server.
          The PostgreSQL client tools must be installed on the server. For Neon, a direct (non-pooled) connection string is recommended for dumps.
        </p>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {backups.length === 0 ? <tr><td colSpan={4} className="text-muted">No backups yet.</td></tr> : backups.map((b) => (
                <tr key={b.fileName}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.fileName}</td>
                  <td>{formatSize(b.sizeBytes)}</td>
                  <td>{new Date(b.createdOn).toLocaleString('en-IN')}</td>
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => download(b.fileName)}>Download</button>
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(b.fileName)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
