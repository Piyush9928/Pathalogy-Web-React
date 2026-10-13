import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/audit-logs', { params: { search } });
      setLogs(res.data.logs);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  function severityPill(severity) {
    if (severity === 'Critical') return 'pill-danger';
    if (severity === 'Warning') return 'pill-warning';
    return 'pill-neutral';
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Events</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.today}</div><div className="kpi-label">Today</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.critical}</div><div className="kpi-label">Critical</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.active_users}</div><div className="kpi-label">Active Users</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ width: 280 }} placeholder="Search by user or details..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Details</th><th>Severity</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><Loader compact /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7}>No audit events found.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_on).toLocaleString('en-IN')}</td>
                    <td>{log.user_name}</td>
                    <td>{log.role}</td>
                    <td>{log.action}</td>
                    <td>{log.module}</td>
                    <td>{log.details}</td>
                    <td><span className={`status-pill ${severityPill(log.severity)}`}>{log.severity}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
