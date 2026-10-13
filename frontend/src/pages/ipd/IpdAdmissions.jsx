import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function IpdAdmissions() {
  const [admissions, setAdmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/ipd/admissions', { params: { search } });
      setAdmissions(res.data.admissions);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load admissions.');
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
      <PageHeader
        title="IPD Admissions"
        actions={
          <>
            <Link className="btn btn-outline-secondary" to="/ipd/bed-board"><i className="bi bi-grid-3x3-gap" /> Bed Board</Link>
            <Link className="btn btn-primary" to="/ipd/admissions/new"><i className="bi bi-plus-lg" /> Admit Patient</Link>
          </>
        }
      />

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.admitted}</div><div className="kpi-label">Currently Admitted</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.discharged}</div><div className="kpi-label">Discharged</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.occupiedBeds}/{stats.totalBeds}</div><div className="kpi-label">Bed Occupancy</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 300 }} placeholder="Search by patient, UHID, or admission #..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Admission #</th><th>Patient</th><th>Ward/Bed</th><th>Doctor</th><th>Admitted On</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading...</td></tr>
              ) : admissions.length === 0 ? (
                <tr><td colSpan={7}>No admissions found.</td></tr>
              ) : (
                admissions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.admission_number}</td>
                    <td>{a.patient_name} <span className="text-muted">({a.patient_uhid})</span></td>
                    <td>{a.ward_name} / Bed {a.bed_number}</td>
                    <td>{a.doctor_name || '—'}</td>
                    <td>{new Date(a.admission_date).toLocaleDateString('en-IN')}</td>
                    <td><span className={`status-pill ${a.status === 'Admitted' ? 'pill-teal' : 'pill-neutral'}`}>{a.status}</span></td>
                    <td><Link className="btn btn-sm btn-outline-secondary" to={`/ipd/admissions/${a.id}`}>View</Link></td>
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
