import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import HospitalBrand from '../../components/HospitalBrand';
import { useAuth } from '../../context/AuthContext';

function paymentPill(status) {
  if (status === 'Paid') return 'pill-success';
  if (status === 'Partially Paid') return 'pill-warning';
  if (status === 'Refunded') return 'pill-neutral';
  return 'pill-danger';
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { hospital } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/invoices/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load invoice.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRecordPayment(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/invoices/${id}/payments`, { amount: Number(paymentAmount), paymentMode });
      setPaymentAmount('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment.');
    }
  }

  async function handleRefund(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/invoices/${id}/refund`, { amount: Number(refundAmount), reason: refundReason });
      setRefundAmount('');
      setRefundReason('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process refund.');
    }
  }

  if (error && !data) return <div className="auth-alert">{error}</div>;
  if (!data) return null;

  const { invoice, items, payments } = data;

  return (
    <>
      <PageHeader
        title={invoice.invoice_number}
        subtitle={`${invoice.patient_name} (${invoice.patient_uhid})`}
        actions={<button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>}
      />

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ flexWrap: 'wrap' }}>
          <div>
            <HospitalBrand hospital={hospital} />
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(invoice.invoice_date).toLocaleString('en-IN')}</div>
          </div>
          <span className={`status-pill ${paymentPill(invoice.paymentStatus)}`}>{invoice.paymentStatus}</span>
        </div>

        <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr', margin: '1rem 0' }}>
          <dl className="detail-list">
            <div><dt>Billed To</dt><dd>{invoice.patient_name}</dd></div>
            <div><dt>UHID</dt><dd>{invoice.patient_uhid}</dd></div>
            <div><dt>Booking Reference</dt><dd>{invoice.booking_number || '—'}</dd></div>
          </dl>
          <dl className="detail-list">
            <div><dt>Referring Doctor</dt><dd>{invoice.doctor_name || 'Self'}</dd></div>
            <div><dt>Payment Mode</dt><dd>{invoice.payment_mode}</dd></div>
            {invoice.is_credit_sale && <div><dt>Credit Terms</dt><dd>{invoice.credit_terms} ({invoice.credit_days} days)</dd></div>}
          </dl>
        </div>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>₹{Number(item.unit_price).toLocaleString('en-IN')}</td>
                  <td>₹{(item.quantity * item.unit_price).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: '1rem' }}>
          <div className="amount-row"><span>Sub Total</span><span>₹{invoice.subTotal.toLocaleString('en-IN')}</span></div>
          {invoice.discount > 0 && <div className="amount-row"><span>Discount</span><span>-₹{invoice.discount.toLocaleString('en-IN')}</span></div>}
          <div className="amount-row"><span>CGST</span><span>₹{invoice.cgstAmount.toLocaleString('en-IN')}</span></div>
          <div className="amount-row"><span>SGST</span><span>₹{invoice.sgstAmount.toLocaleString('en-IN')}</span></div>
          <div className="amount-row total"><span>Grand Total</span><span>₹{invoice.grandTotal.toLocaleString('en-IN')}</span></div>
          <div className="amount-row"><span>Amount Paid</span><span>₹{invoice.paidAmount.toLocaleString('en-IN')}</span></div>
          {invoice.refund > 0 && (
            <div className="amount-row"><span>Refunded {invoice.refund_reason && `(${invoice.refund_reason})`}</span><span>-₹{invoice.refund.toLocaleString('en-IN')}</span></div>
          )}
          <div className="amount-row total"><span>Balance Due</span><span className="text-danger">₹{invoice.balanceDue.toLocaleString('en-IN')}</span></div>
        </div>
      </div>

      <div className="lsp-panel no-print">
        <h3><span className="h-ico"><i className="bi bi-clock-history" /></span> Payment History</h3>
        {payments.length === 0 ? <p className="text-muted">No payments recorded yet.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {payments.map((p) => (
              <li key={p.id} className="d-flex justify-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--lsp-border)', fontSize: '0.85rem' }}>
                <span>{p.payment_mode} {p.recorded_by && `· ${p.recorded_by}`}</span>
                <span>₹{Number(p.amount).toLocaleString('en-IN')} on {new Date(p.paid_at).toLocaleDateString('en-IN')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dash-row no-print" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {invoice.balanceDue > 0 && (
          <form onSubmit={handleRecordPayment} className="lsp-panel mb-0">
            <h3><span className="h-ico"><i className="bi bi-cash-stack" /></span> Record Payment</h3>
            <div className="form-group">
              <label className="form-label">Amount (₹, max {invoice.balanceDue})</label>
              <input className="form-control" type="number" min={0} max={invoice.balanceDue} required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option>Cash</option><option>Card</option><option>UPI</option><option>Net Banking</option><option>Cheque</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">Record Payment</button>
          </form>
        )}

        {invoice.paidAmount > invoice.refund && (
          <form onSubmit={handleRefund} className="lsp-panel mb-0">
            <h3><span className="h-ico"><i className="bi bi-arrow-counterclockwise" /></span> Refund</h3>
            <div className="form-group">
              <label className="form-label">Refund Amount (₹, max {(invoice.paidAmount - invoice.refund).toFixed(2)})</label>
              <input className="form-control" type="number" min={0} max={invoice.paidAmount - invoice.refund} required value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <input className="form-control" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </div>
            <button className="btn btn-outline-secondary" type="submit">Process Refund</button>
          </form>
        )}
      </div>
    </>
  );
}
