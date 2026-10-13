import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doctorApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

const fmt = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function DoctorHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    doctorApi.get('/doctor-portal/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your referrals.'));
  }, []);

  if (error) return <div className="auth-alert" role="alert">{error}</div>;
  if (!data) return <div className="lsp-panel">Loading...</div>;

  const { doctor, patients, bookings, reports } = data;
  return (
    <>
      <PageHeader title="My Referrals" subtitle={`${doctor.full_name} · ${doctor.specialization}`} />

      <div className="kpi-row">
        {[['Referred patients', patients.length, 'bi-people', 'ic-primary'], ['Bookings', bookings.length, 'bi-calendar-check', 'ic-teal'],
          ['Reports', reports.length, 'bi-file-earmark-medical', 'ic-violet'], ['Reports ready', reports.filter((r) => r.available).length, 'bi-check2-circle', 'ic-success']]
          .map(([label, value, icon, tone]) => (
            <div className="kpi-card" key={label}>
              <div className="kpi-top"><span className={`kpi-icon ${tone}`}><i className={`bi ${icon}`} /></span></div>
              <div className="kpi-value">{value}</div><div className="kpi-label">{label}</div>
            </div>
          ))}
      </div>

      <h2 className="section-title">Reports</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Report</th><th>Patient</th><th>Booking</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {reports.length === 0 ? <tr><td colSpan={5} className="text-muted">No reports yet.</td></tr> : reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.report_number}</td>
                  <td>{r.patient_name} <span className="text-muted">({r.patient_uhid})</span></td>
                  <td>{r.booking_number}</td>
                  <td>
                    <span className={`status-pill ${r.available ? 'pill-success' : 'pill-neutral'}`}>{r.available ? r.status : 'In progress'}</span>
                    {r.available && r.has_critical_result && <span className="status-pill pill-danger" style={{ marginLeft: 6 }}>Critical</span>}
                  </td>
                  <td>{r.available && <Link className="btn btn-sm btn-outline-secondary" to={`/doctor-portal/reports/${r.id}`}>View</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Referred patients</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>UHID</th><th>Name</th><th>Gender / Age</th><th>Phone</th><th>Registered</th></tr></thead>
            <tbody>
              {patients.length === 0 ? <tr><td colSpan={5} className="text-muted">No referred patients.</td></tr> : patients.map((p) => (
                <tr key={p.id}><td>{p.uhid}</td><td>{p.full_name}</td><td>{p.gender}{p.age != null ? `, ${p.age}` : ''}</td><td>{p.phone}</td><td>{fmt(p.registered_on)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Bookings</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Booking</th><th>Patient</th><th>Date</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {bookings.length === 0 ? <tr><td colSpan={5} className="text-muted">No bookings.</td></tr> : bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.booking_number}</td><td>{b.patient_name}</td><td>{fmt(b.booking_date)}</td>
                  <td><span className="status-pill pill-info">{b.status}</span></td>
                  <td className="text-right">₹{Number(b.total_amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
