import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const STAGE_CLASS = {
  Delivered: 'sel-success', Approved: 'sel-success', Cancelled: 'sel-danger',
  Booked: 'sel-info', Collected: 'sel-info', Processing: 'sel-warning', Verified: 'sel-warning',
};

function paymentPill(status) {
  if (status === 'Paid') return 'pill-success';
  if (status === 'Partially Paid') return 'pill-warning';
  return 'pill-danger';
}

export default function BookingsList() {
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/bookings', { params: { search } });
      setBookings(res.data.bookings);
      setStats(res.data.stats);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function updateStatus(booking, status) {
    try {
      await apiClient.patch(`/bookings/${booking.id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Walk-in, online, and home collection bookings"
        actions={<Link className="btn btn-primary" to="/bookings/new"><i className="bi bi-journal-plus" /> New Booking</Link>}
      />

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.today_count}</div><div className="kpi-label">Booked Today</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.pending_collection}</div><div className="kpi-label">Pending Collection</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.in_process}</div><div className="kpi-label">In Process</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.delivered}</div><div className="kpi-label">Delivered</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 320 }} placeholder="Search by patient, UHID, or booking number..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr><th>Booking</th><th>Patient</th><th>Referred By</th><th>Source</th><th>Tests</th><th>Amount</th><th>Payment</th><th>Stage</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}>Loading...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={9}>No bookings found.</td></tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.booking_number}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{new Date(b.booking_date).toLocaleDateString('en-IN')}</div>
                    </td>
                    <td>
                      <div>{b.patient_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{b.patient_uhid}</div>
                    </td>
                    <td>{b.doctor_name || 'Self'}</td>
                    <td><span className="status-pill pill-neutral">{b.booking_type}</span></td>
                    <td>{b.test_count} test{b.test_count === '1' ? '' : 's'}</td>
                    <td>
                      ₹{Number(b.total_amount).toLocaleString('en-IN')}
                      {Number(b.paid_amount) < Number(b.total_amount) && (
                        <div className="text-danger" style={{ fontSize: '0.72rem' }}>
                          ₹{(Number(b.total_amount) - Number(b.paid_amount)).toLocaleString('en-IN')} due
                        </div>
                      )}
                    </td>
                    <td><span className={`status-pill ${paymentPill(b.payment_status)}`}>{b.payment_status}</span></td>
                    <td>
                      <select
                        className="form-select"
                        style={{ minWidth: 120 }}
                        value={b.status}
                        onChange={(e) => updateStatus(b, e.target.value)}
                      >
                        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="d-flex gap-2">
                      <Link className="btn btn-sm btn-outline-secondary" to={`/bookings/${b.id}`}>Details</Link>
                      <Link className="btn btn-sm btn-outline-secondary" to={`/bookings/${b.id}/label`}>Label</Link>
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
