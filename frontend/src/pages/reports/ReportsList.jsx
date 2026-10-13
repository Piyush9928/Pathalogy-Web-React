import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

function statusPill(status) {
  if (status === 'Delivered' || status === 'Approved') return 'pill-success';
  if (status === 'Verified') return 'pill-teal';
  if (status === 'Completed') return 'pill-warning';
  return 'pill-neutral';
}

export default function ReportsList() {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/reports', { params: { search, status } });
      setReports(res.data.reports);
      setStats(res.data.stats);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Result entry, verification, and approval queue" />

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.pending}</div><div className="kpi-label">Pending Entry</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.awaiting_verification}</div><div className="kpi-label">Awaiting Verification</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.completed}</div><div className="kpi-label">Verified/Approved</div></div>
          <div className="kpi-card">
            <div className="kpi-top"><span className="kpi-icon ic-danger"><i className="bi bi-exclamation-triangle-fill" /></span></div>
            <div className="kpi-value text-danger">{stats.critical}</div><div className="kpi-label">Critical Results</div>
          </div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 300 }} placeholder="Search by patient, UHID, or report number..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Report</th><th>Patient</th><th>Booking</th><th>Referred By</th><th>Status</th><th>Critical</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><Loader compact /></td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={7}>No reports found.</td></tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.report_number}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{new Date(r.created_on).toLocaleDateString('en-IN')}</div>
                    </td>
                    <td>
                      <div>{r.patient_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.patient_uhid} · {r.gender}/{r.age}</div>
                    </td>
                    <td>{r.booking_number}</td>
                    <td>{r.doctor_name || 'Self'}</td>
                    <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                    <td>{r.has_critical_result && <span className="status-pill pill-danger is-critical">Critical</span>}</td>
                    <td>
                      {r.status === 'Pending' || r.status === 'Completed' ? (
                        <Link className="btn btn-sm btn-primary" to={`/reports/${r.id}/entry`}>Enter Results</Link>
                      ) : (
                        <Link className="btn btn-sm btn-outline-secondary" to={`/reports/${r.id}`}>View</Link>
                      )}
                    </td>
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
