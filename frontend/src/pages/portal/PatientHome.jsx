import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { patientApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

const fmt = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function PatientHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    patientApi.get('/patient-portal/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your records.'));
  }, []);

  if (error) return <div className="auth-alert" role="alert">{error}</div>;
  if (!data) return <div className="lsp-panel">Loading...</div>;

  const { patient, bookings, reports, invoices } = data;
  return (
    <>
      <PageHeader title="My Health Records" subtitle={`${patient.full_name} · ${patient.uhid}`} />

      <div className="lsp-panel">
        <dl className="detail-grid">
          <div><dt>Gender / Age</dt><dd>{patient.gender}{patient.age != null ? `, ${patient.age} yrs` : ''}</dd></div>
          <div><dt>Blood group</dt><dd>{patient.blood_group || '—'}</dd></div>
          <div><dt>Phone</dt><dd>{patient.phone}</dd></div>
          <div><dt>Registered</dt><dd>{fmt(patient.registered_on)}</dd></div>
        </dl>
      </div>

      <h2 className="section-title">Reports</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Report</th><th>Booking</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {reports.length === 0 ? <tr><td colSpan={4} className="text-muted">No reports yet.</td></tr> : reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.report_number}</td><td>{r.booking_number}</td>
                  <td><span className={`status-pill ${r.available ? 'pill-success' : 'pill-neutral'}`}>{r.available ? 'Ready' : 'In progress'}</span></td>
                  <td>{r.available && <Link className="btn btn-sm btn-outline-secondary" to={`/patient-portal/reports/${r.id}`}>View</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Bookings</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Booking</th><th>Date</th><th>Type</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {bookings.length === 0 ? <tr><td colSpan={5} className="text-muted">No bookings.</td></tr> : bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.booking_number}</td><td>{fmt(b.booking_date)}</td><td>{b.booking_type}</td>
                  <td><span className="status-pill pill-info">{b.status}</span></td><td className="text-right">{inr(b.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Invoices</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Invoice</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Balance</th><th></th></tr></thead>
            <tbody>
              {invoices.length === 0 ? <tr><td colSpan={5} className="text-muted">No invoices.</td></tr> : invoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoice_number}</td><td>{fmt(i.invoice_date)}</td><td className="text-right">{inr(i.grandTotal)}</td>
                  <td className="text-right">{inr(i.balanceDue)}</td>
                  <td><Link className="btn btn-sm btn-outline-secondary" to={`/patient-portal/invoices/${i.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
