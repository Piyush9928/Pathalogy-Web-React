import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_LINE = { medicineItemId: '', batchNo: '', expiryDate: '', quantity: 1, purchaseRate: 0, mrp: 0 };

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [items, setItems] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [purchasesRes, itemsRes] = await Promise.all([apiClient.get('/pharmacy/purchases'), apiClient.get('/pharmacy/items')]);
      setPurchases(purchasesRes.data.purchases);
      setItems(itemsRes.data.items);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchases.');
    }
  }

  useEffect(() => { load(); }, []);

  function updateLine(index, field, value) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/pharmacy/purchases', { supplier, invoiceNo, lines });
      setSupplier(''); setInvoiceNo(''); setLines([{ ...EMPTY_LINE }]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record purchase.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-truck" /></span> Purchases (Batch Receiving)</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Purchase</button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Supplier</label>
                <input className="form-control" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Invoice No.</label>
                <input className="form-control" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
            </div>

            <div className="lsp-table-wrapper" style={{ marginBottom: '0.8rem' }}>
              <table className="lsp-table">
                <thead><tr><th>Medicine</th><th>Batch No.</th><th>Expiry</th><th>Qty</th><th>Rate</th><th>MRP</th><th></th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select className="form-select" required value={line.medicineItemId} onChange={(e) => updateLine(i, 'medicineItemId', e.target.value)}>
                          <option value="">Select</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 120 }}><input className="form-control" required value={line.batchNo} onChange={(e) => updateLine(i, 'batchNo', e.target.value)} /></td>
                      <td style={{ width: 150 }}><input className="form-control" type="date" required value={line.expiryDate} onChange={(e) => updateLine(i, 'expiryDate', e.target.value)} /></td>
                      <td style={{ width: 90 }}><input className="form-control" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} /></td>
                      <td style={{ width: 100 }}><input className="form-control" type="number" min={0} value={line.purchaseRate} onChange={(e) => updateLine(i, 'purchaseRate', e.target.value)} /></td>
                      <td style={{ width: 100 }}><input className="form-control" type="number" min={0} value={line.mrp} onChange={(e) => updateLine(i, 'mrp', e.target.value)} /></td>
                      <td><button className="btn btn-sm btn-danger" type="button" onClick={() => removeLine(i)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addLine} style={{ marginBottom: '1rem' }}><i className="bi bi-plus" /> Add Line</button>
            <div><button className="btn btn-primary" type="submit">Save Purchase</button></div>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Purchase #</th><th>Supplier</th><th>Invoice No.</th><th>Date</th><th>Lines</th></tr></thead>
            <tbody>
              {purchases.length === 0 ? <tr><td colSpan={5}>No purchases found.</td></tr> : purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.purchase_number}</td>
                  <td>{p.supplier || '—'}</td>
                  <td>{p.invoice_no || '—'}</td>
                  <td>{new Date(p.purchase_date).toLocaleDateString('en-IN')}</td>
                  <td>{p.lines.length} item(s)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
