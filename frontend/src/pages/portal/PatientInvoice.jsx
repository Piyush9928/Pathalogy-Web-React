import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { patientApi, getSession } from '../../api/kindClient';
import HospitalBrand from '../../components/HospitalBrand';
import PageHeader from '../../components/PageHeader';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PatientInvoice() {
  const { id } = useParams();
  const hospital = getSession('patient')?.hospital;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    patientApi.get(`/patient-portal/invoices/${id}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the invoice.'));
  }, [id]);

  const back = <Link className="btn btn-outline-secondary" to="/patient-portal"><i className="bi bi-arrow-left" /> Back</Link>;
  if (error) return (<><PageHeader title="Invoice" actions={back} /><div className="auth-alert" role="alert">{error}</div></>);
  if (!data) return <div className="lsp-panel">Loading...</div>;

  const { invoice: inv, items, payments } = data;
  return (
    <>
      <PageHeader title={`Invoice ${inv.invoice_number}`} subtitle={fmt(inv.invoice_date)}
        actions={<>{back}<button type="button" className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button></>} />
      <div className="lsp-panel">
        <HospitalBrand hospital={hospital} style={{ marginBottom: '0.8rem' }} />
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.name || it.description}</td><td className="text-right">{it.quantity}</td>
                  <td className="text-right">{inr(it.unit_price)}</td><td className="text-right">{inr(Number(it.quantity) * Number(it.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="detail-grid" style={{ marginTop: '1rem' }}>
          <div><dt>Sub total</dt><dd>{inr(inv.sub_total)}</dd></div>
          <div><dt>Discount</dt><dd>{inr(inv.discount_amount)}</dd></div>
          <div><dt>Grand total</dt><dd>{inr(inv.grandTotal)}</dd></div>
          <div><dt>Paid</dt><dd>{inr(inv.paidAmount)}</dd></div>
          <div><dt>Balance due</dt><dd>{inr(inv.balanceDue)}</dd></div>
        </dl>
      </div>
      {payments.length > 0 && (
        <>
          <h2 className="section-title">Payments</h2>
          <div className="lsp-panel">
            <div className="lsp-table-wrapper">
              <table className="lsp-table">
                <thead><tr><th>Date</th><th>Mode</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{payments.map((p) => <tr key={p.id}><td>{fmt(p.paid_at)}</td><td>{p.payment_mode}</td><td className="text-right">{inr(p.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
