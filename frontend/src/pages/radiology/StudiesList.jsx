import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

export default function StudiesList() {
  const [studies, setStudies] = useState([]);
  const [stats, setStats] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/radiology/studies', { params: { search, status } });
      setStudies(res.data.studies);
      setStats(res.data.stats);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load radiology studies.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFilter(e) {
    e.preventDefault();
    await load();
  }

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/radiology/new"><i className="bi bi-plus-lg" /> New Study</Link>
        </div>
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Studies</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.awaitingFindings}</div><div className="kpi-label">Awaiting Findings</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.reported}</div><div className="kpi-label">Reported</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleFilter} className="row-g" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ flex: '2 1 260px' }} placeholder="Search by accession no., patient, or UHID..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select" style={{ flex: '1 1 160px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /> Search</button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Accession #</th><th>Patient</th><th>Modality</th><th>Body Part</th><th>Study Date</th><th>Images</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><Loader compact /></td></tr>
              ) : studies.length === 0 ? (
                <tr><td colSpan={8}>No radiology studies found.</td></tr>
              ) : studies.map((s) => (
                <tr key={s.id}>
                  <td>{s.accession_number}</td>
                  <td>{s.patient_name || s.walk_in_patient_name} {s.patient_uhid && <span className="text-muted">({s.patient_uhid})</span>}</td>
                  <td><span className="status-pill pill-neutral">{s.modality}</span></td>
                  <td>{s.body_part} {s.is_cardiac_study && <i className="bi bi-heart-pulse-fill text-danger" title="Cardiac study" />}</td>
                  <td>{new Date(s.study_date).toLocaleDateString('en-IN')}</td>
                  <td>{s.image_count}</td>
                  <td><span className={`status-pill ${s.status === 'Reported' ? 'pill-teal' : 'pill-amber'}`}>{s.status}</span></td>
                  <td><Link className="btn btn-sm btn-outline-secondary" to={`/radiology/${s.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
