import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function PosSale() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [cart, setCart] = useState([]); // [{item, quantity}]
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [walkInName, setWalkInName] = useState('Walk-in Customer');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [doctorsName, setDoctorsName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!search) return setSuggestions([]);
    const timeout = setTimeout(() => {
      apiClient.get('/pharmacy/items/autocomplete', { params: { q: search } }).then((res) => setSuggestions(res.data.items)).catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      return [...prev, { item, quantity: 1 }];
    });
    setSearch('');
    setSuggestions([]);
  }

  function updateQuantity(itemId, quantity) {
    setCart((prev) => prev.map((c) => (c.item.id === itemId ? { ...c, quantity: Number(quantity) } : c)));
  }

  function removeFromCart(itemId) {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }

  const totals = useMemo(() => {
    let subTotal = 0, gstTotal = 0;
    cart.forEach(({ item, quantity }) => {
      const lineAmount = quantity * Number(item.latest_mrp);
      subTotal += lineAmount;
      gstTotal += lineAmount * Number(item.gst_percent) / 100;
    });
    const grandTotal = subTotal + gstTotal;
    return { subTotal, gstTotal, grandTotal };
  }, [cart]);

  async function handleCheckout() {
    setError('');
    if (cart.length === 0) return setError('Cart is empty.');

    setSaving(true);
    try {
      const res = await apiClient.post('/pharmacy/sales', {
        patientId: patientId || null, walkInName, paymentMode, paidAmount: paidAmount || totals.grandTotal, doctorsName,
        lines: cart.map((c) => ({ medicineItemId: c.item.id, quantity: c.quantity })),
      });
      setCart([]);
      navigate(`/pharmacy/sales/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="POS Sale" subtitle="Batch selection is automatic (first-expiry-first-out) — you only pick the medicine and quantity." />
      {error && <div className="auth-alert">{error}</div>}

      <div className="dash-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Search Medicine</label>
            <input className="form-control" placeholder="Type medicine name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="lsp-dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 260, overflowY: 'auto' }}>
                {suggestions.map((item) => (
                  <button key={item.id} type="button" className="dropdown-item" onClick={() => addToCart(item)}>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    <span className="text-muted">₹{Number(item.latest_mrp).toLocaleString('en-IN')} · stock {item.current_stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th>Medicine</th><th>Qty</th><th>MRP</th><th>GST</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {cart.length === 0 ? <tr><td colSpan={6}>Cart is empty. Search and add medicines above.</td></tr> : cart.map(({ item, quantity }) => (
                  <tr key={item.id}>
                    <td>{item.name} <span className="text-muted">(stock {item.current_stock})</span></td>
                    <td style={{ width: 90 }}><input className="form-control" type="number" min={1} max={item.current_stock} value={quantity} onChange={(e) => updateQuantity(item.id, e.target.value)} /></td>
                    <td>₹{Number(item.latest_mrp).toLocaleString('en-IN')}</td>
                    <td>{item.gst_percent}%</td>
                    <td>₹{(quantity * Number(item.latest_mrp)).toLocaleString('en-IN')}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeFromCart(item.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-receipt" /></span> Checkout</h3>
          <div className="form-group">
            <label className="form-label">Patient</label>
            <select className="form-select" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Walk-in Customer</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
          {!patientId && (
            <div className="form-group">
              <label className="form-label">Walk-in Name</label>
              <input className="form-control" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Doctor (optional)</label>
            <input className="form-control" value={doctorsName} onChange={(e) => setDoctorsName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Payment Mode</label>
            <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option>Cash</option><option>Card</option><option>UPI</option><option>Net Banking</option><option>Cheque</option>
            </select>
          </div>

          <div className="amount-row"><span>Sub Total</span><span>₹{totals.subTotal.toLocaleString('en-IN')}</span></div>
          <div className="amount-row"><span>GST</span><span>₹{totals.gstTotal.toLocaleString('en-IN')}</span></div>
          <div className="amount-row total"><span>Grand Total</span><span>₹{totals.grandTotal.toLocaleString('en-IN')}</span></div>

          <div className="form-group">
            <label className="form-label">Paid Amount (₹)</label>
            <input className="form-control" type="number" placeholder={totals.grandTotal.toFixed(2)} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>

          <button className="btn btn-primary btn-block" onClick={handleCheckout} disabled={saving || cart.length === 0}>
            {saving ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>
    </>
  );
}
