import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

export default function EchoWorklist() {
  const [worklist, setWorklist] = useState([]);
  const [stats, setStats] = useState(null);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/radiology/echo/worklist', { params: { includeCompleted } });
      setWorklist(res.data.worklist);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load the Echo worklist.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [includeCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/radiology/new?source=echo"><i className="bi bi-plus-lg" /> New Echo Study</Link>
        </div>
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.pending}</div><div className="kpi-label">Pending</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.completed}</div><div className="kpi-label">Completed</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <label className="d-flex align-center gap-2" style={{ marginBottom: '1rem' }}>
          <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} /> Include completed reports
        </label>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Accession #</th><th>Patient</th><th>Study Date</th><th>Due Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><Loader compact /></td></tr>
              ) : worklist.length === 0 ? (
                <tr><td colSpan={6}>No echo studies found.</td></tr>
              ) : worklist.map((w) => (
                <tr key={w.id}>
                  <td>{w.accession_number}</td>
                  <td>{w.patient_name || w.walk_in_patient_name} {w.patient_uhid && <span className="text-muted">({w.patient_uhid})</span>}</td>
                  <td>{new Date(w.study_date).toLocaleDateString('en-IN')}</td>
                  <td>{w.dueAmount > 0 ? <span className="text-danger">₹{Number(w.dueAmount).toLocaleString('en-IN')}</span> : '—'}</td>
                  <td><span className={`status-pill ${w.isCompleted ? 'pill-teal' : 'pill-amber'}`}>{w.isCompleted ? 'Completed' : 'Pending'}</span></td>
                  <td>
                    <Link className="btn btn-sm btn-primary" to={`/radiology/echo/${w.id}/report`}>{w.isCompleted ? 'View Report' : 'Enter Report'}</Link>
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
