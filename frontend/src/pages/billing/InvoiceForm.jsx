import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function InvoiceForm() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [gstRates, setGstRates] = useState([0, 5, 12, 18]);
  const [paymentModes, setPaymentModes] = useState(['Cash']);

  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [items, setItems] = useState([{ name: '', quantity: 1, unitPrice: 0, testId: null }]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstPercent, setGstPercent] = useState(18);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [creditDays, setCreditDays] = useState(30);
  const [creditTerms, setCreditTerms] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/bookings').then((res) => {
      setBookings(res.data.bookings);
      setGstRates(res.data.gstRates || gstRates);
      setPaymentModes(res.data.paymentModes || paymentModes);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const subTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitPrice || 0), 0),
    [items]
  );
  const taxableValue = Math.max(subTotal - Number(discountAmount || 0), 0);
  const gstAmount = Math.round(taxableValue * Number(gstPercent) / 100 * 100) / 100;
  const cgst = Math.round((gstAmount / 2) * 100) / 100;
  const sgst = Math.round((gstAmount - cgst) * 100) / 100;
  const grandTotal = Math.round((taxableValue + gstAmount) * 100) / 100;
  const balance = Math.max(grandTotal - Number(paidAmount || 0), 0);

  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { name: '', quantity: 1, unitPrice: 0, testId: null }]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!patientId) return setError('Select a patient.');
    if (items.some((i) => !i.name)) return setError('Every line item needs a description.');

    setSaving(true);
    try {
      const res = await apiClient.post('/invoices', {
        patientId, doctorId: doctorId || null, bookingId: bookingId || null, items,
        discountAmount: Number(discountAmount || 0), gstPercent: Number(gstPercent),
        paidAmount: Number(paidAmount || 0), paymentMode, isCreditSale, creditDays: Number(creditDays), creditTerms,
      });
      navigate(`/billing/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create invoice.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New Invoice" />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Patient *</label>
            <select className="form-select" required value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Select patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Referring Doctor</label>
            <select className="form-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Self</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Booking Reference</label>
            <select className="form-select" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
              <option value="">None</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>{b.booking_number}</option>)}
            </select>
          </div>
        </div>

        <h3><span className="h-ico"><i className="bi bi-list-ul" /></span> Line Items</h3>
        <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
          <table className="lsp-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit Price (₹)</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td><input className="form-control" required value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} /></td>
                  <td style={{ width: 80 }}><input className="form-control" type="number" min={1} value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} /></td>
                  <td style={{ width: 140 }}><input className="form-control" type="number" min={0} value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', e.target.value)} /></td>
                  <td>₹{(Number(item.quantity || 1) * Number(item.unitPrice || 0)).toLocaleString('en-IN')}</td>
                  <td><button className="btn btn-sm btn-danger" type="button" onClick={() => removeItem(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addItem} style={{ marginBottom: '1rem' }}>
          <i className="bi bi-plus" /> Add Line Item
        </button>

        <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="lsp-panel mb-0" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Discount (₹)</label>
                <input className="form-control" type="number" min={0} max={subTotal} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">GST %</label>
                <select className="form-select" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)}>
                  {gstRates.map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Paid Amount (₹)</label>
                <input className="form-control" type="number" min={0} max={grandTotal} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  {paymentModes.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <label className="d-flex align-center gap-2">
              <input type="checkbox" checked={isCreditSale} onChange={(e) => setIsCreditSale(e.target.checked)} /> Credit Sale
            </label>
            {isCreditSale && (
              <div className="row-g mt-2">
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label className="form-label">Credit Days</label>
                  <input className="form-control" type="number" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '2 1 200px' }}>
                  <label className="form-label">Credit Terms</label>
                  <input className="form-control" value={creditTerms} onChange={(e) => setCreditTerms(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="lsp-panel mb-0">
            <div className="amount-row"><span>Sub Total</span><span>₹{subTotal.toLocaleString('en-IN')}</span></div>
            <div className="amount-row"><span>Discount</span><span>₹{Number(discountAmount || 0).toLocaleString('en-IN')}</span></div>
            <div className="amount-row"><span>Taxable Value</span><span>₹{taxableValue.toLocaleString('en-IN')}</span></div>
            <div className="amount-row"><span>CGST @{gstPercent / 2}%</span><span>₹{cgst.toLocaleString('en-IN')}</span></div>
            <div className="amount-row"><span>SGST @{gstPercent / 2}%</span><span>₹{sgst.toLocaleString('en-IN')}</span></div>
            <div className="amount-row total"><span>Grand Total</span><span>₹{grandTotal.toLocaleString('en-IN')}</span></div>
            <div className="amount-row"><span>Paid</span><span>₹{Number(paidAmount || 0).toLocaleString('en-IN')}</span></div>
            <div className="amount-row total"><span>Balance Due</span><span className="text-danger">₹{balance.toLocaleString('en-IN')}</span></div>
          </div>
        </div>

        <div className="d-flex gap-2 mt-3">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Invoice'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
