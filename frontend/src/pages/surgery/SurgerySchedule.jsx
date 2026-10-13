import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

function statusPillClass(status) {
  if (status === 'Completed') return 'pill-teal';
  if (status === 'In Surgery') return 'pill-red';
  if (status === 'Cancelled' || status === 'Postponed') return 'pill-neutral';
  return 'pill-amber';
}

export default function SurgerySchedule() {
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [status, setStatus] = useState('');
  const [theatreId, setTheatreId] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/surgery/bookings', { params: { status, theatreId, date } });
      setBookings(res.data.bookings);
      setStats(res.data.stats);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load surgery schedule.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.get('/surgery/theatres').then((res) => setTheatres(res.data.theatres)).catch(() => {});
  }, []);

  async function handleFilter(e) {
    e.preventDefault();
    await load();
  }

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/surgery/schedule/new"><i className="bi bi-plus-lg" /> Schedule Surgery</Link>
        </div>
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.scheduled}</div><div className="kpi-label">Scheduled</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.inSurgery}</div><div className="kpi-label">In Surgery</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.completedToday}</div><div className="kpi-label">Completed Today</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleFilter} className="row-g" style={{ marginBottom: '1rem' }}>
          <select className="form-select" style={{ flex: '1 1 160px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="form-select" style={{ flex: '1 1 200px' }} value={theatreId} onChange={(e) => setTheatreId(e.target.value)}>
            <option value="">All Theatres</option>
            {theatres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="form-control" style={{ flex: '1 1 160px' }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-funnel" /> Filter</button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Case #</th><th>Patient</th><th>Procedure</th><th>Theatre</th><th>Lead Surgeon</th><th>Scheduled</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}>Loading...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={9}>No surgeries found.</td></tr>
              ) : bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.case_number}</td>
                  <td>{b.patient_name} <span className="text-muted">({b.patient_uhid})</span></td>
                  <td>{b.surgery_name}</td>
                  <td>{b.theatre_name}</td>
                  <td>{b.lead_surgeon_name || '—'}</td>
                  <td>{new Date(b.scheduled_start_time).toLocaleString('en-IN')}</td>
                  <td><span className="status-pill pill-neutral">{b.priority}</span></td>
                  <td><span className={`status-pill ${statusPillClass(b.status)}`}>{b.status}</span></td>
                  <td><Link className="btn btn-sm btn-outline-secondary" to={`/surgery/schedule/${b.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
