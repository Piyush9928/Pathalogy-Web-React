import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

function paymentPill(status) {
  if (status === 'Paid') return 'pill-success';
  if (status === 'Partially Paid') return 'pill-warning';
  if (status === 'Refunded') return 'pill-neutral';
  return 'pill-danger';
}

export default function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [totals, setTotals] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/invoices', { params: { search } });
      setInvoices(res.data.invoices);
      setTotals(res.data.totals);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load invoices.');
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
        title="Billing"
        subtitle="Invoices, payments, and revenue"
        actions={
          <>
            <Link className="btn btn-outline-secondary" to="/billing/reports"><i className="bi bi-graph-up" /> Reports</Link>
            <Link className="btn btn-primary" to="/billing/new"><i className="bi bi-receipt-cutoff" /> New Invoice</Link>
          </>
        }
      />

      {totals && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">₹{totals.grandTotal.toLocaleString('en-IN')}</div><div className="kpi-label">Total Billed</div></div>
          <div className="kpi-card"><div className="kpi-value text-success">₹{totals.paidAmount.toLocaleString('en-IN')}</div><div className="kpi-label">Total Collected</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">₹{totals.balanceDue.toLocaleString('en-IN')}</div><div className="kpi-label">Outstanding</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 320 }} placeholder="Search by patient, UHID, or invoice number..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Invoice</th><th>Patient</th><th>Sub Total</th><th>Discount</th><th>GST</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><Loader compact /></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9}>No invoices found.</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inv.invoice_number}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</div>
                    </td>
                    <td>
                      <div>{inv.patient_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{inv.patient_uhid}</div>
                    </td>
                    <td>₹{inv.subTotal.toLocaleString('en-IN')}</td>
                    <td>₹{inv.discount.toLocaleString('en-IN')}</td>
                    <td>₹{inv.gstAmount.toLocaleString('en-IN')} ({inv.gst_percent}%)</td>
                    <td style={{ fontWeight: 600 }}>₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                    <td className={inv.balanceDue > 0 ? 'text-danger' : ''}>₹{inv.balanceDue.toLocaleString('en-IN')}</td>
                    <td><span className={`status-pill ${paymentPill(inv.paymentStatus)}`}>{inv.paymentStatus}</span></td>
                    <td><Link className="btn btn-sm btn-outline-secondary" to={`/billing/${inv.id}`}>View</Link></td>
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
