import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { supplierId: '', expectedDate: '', lines: [{ itemId: '', quantity: 1, unitCost: 0, gstPercent: 0 }] };

function statusPill(status) {
  if (status === 'Received') return 'pill-success';
  if (status === 'Cancelled') return 'pill-neutral';
  if (status === 'Ordered') return 'pill-teal';
  return 'pill-warning';
}

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [statusCounts, setStatusCounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [poRes, supRes, itemsRes] = await Promise.all([
        apiClient.get('/purchase-orders'),
        apiClient.get('/suppliers'),
        apiClient.get('/inventory'),
      ]);
      setOrders(poRes.data.purchaseOrders);
      setStatusCounts(poRes.data.statusCounts);
      setSuppliers(supRes.data.suppliers);
      setItems(itemsRes.data.items);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase orders.');
    }
  }

  useEffect(() => { load(); }, []);

  function updateLine(index, field, value) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)) }));
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { itemId: '', quantity: 1, unitCost: 0, gstPercent: 0 }] }));
  }

  function removeLine(index) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/purchase-orders', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create purchase order.');
    }
  }

  async function markOrdered(po) {
    try {
      await apiClient.patch(`/purchase-orders/${po.id}/mark-ordered`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function receive(po) {
    if (!window.confirm(`Receive ${po.po_number}? This will increase stock for all line items.`)) return;
    try {
      await apiClient.post(`/purchase-orders/${po.id}/receive`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to receive purchase order.');
    }
  }

  async function cancel(po) {
    try {
      await apiClient.patch(`/purchase-orders/${po.id}/cancel`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {statusCounts.length > 0 && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', marginBottom: '1rem' }}>
          {['Draft', 'Ordered', 'Received', 'Cancelled'].map((s) => (
            <div className="kpi-card" key={s}>
              <div className="kpi-value">{statusCounts.find((c) => c.status === s)?.count || 0}</div>
              <div className="kpi-label">{s}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-truck" /></span> Purchase Orders</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Purchase Order</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Supplier</label>
                <select className="form-select" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Expected Date</label>
                <input className="form-control" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </div>
            </div>

            <div className="lsp-table-wrapper" style={{ marginBottom: '0.8rem' }}>
              <table className="lsp-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>GST %</th><th></th></tr></thead>
                <tbody>
                  {form.lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select className="form-select" required value={line.itemId} onChange={(e) => updateLine(i, 'itemId', e.target.value)}>
                          <option value="">Select item</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 90 }}><input className="form-control" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} /></td>
                      <td style={{ width: 120 }}><input className="form-control" type="number" min={0} value={line.unitCost} onChange={(e) => updateLine(i, 'unitCost', e.target.value)} /></td>
                      <td style={{ width: 100 }}><input className="form-control" type="number" min={0} value={line.gstPercent} onChange={(e) => updateLine(i, 'gstPercent', e.target.value)} /></td>
                      <td><button className="btn btn-sm btn-danger" type="button" onClick={() => removeLine(i)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addLine} style={{ marginBottom: '1rem' }}><i className="bi bi-plus" /> Add Line</button>
            <div>
              <button className="btn btn-primary" type="submit">Create Purchase Order</button>
            </div>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>PO Number</th><th>Supplier</th><th>Order Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.length === 0 ? <tr><td colSpan={6}>No purchase orders found.</td></tr> : orders.map((po) => (
                <tr key={po.id}>
                  <td>{po.po_number}</td>
                  <td>{po.supplier_name || '—'}</td>
                  <td>{new Date(po.order_date).toLocaleDateString('en-IN')}</td>
                  <td>₹{po.totalAmount.toLocaleString('en-IN')}</td>
                  <td><span className={`status-pill ${statusPill(po.status)}`}>{po.status}</span></td>
                  <td className="d-flex gap-2">
                    {po.status === 'Draft' && <button className="btn btn-sm btn-outline-secondary" onClick={() => markOrdered(po)}>Mark Ordered</button>}
                    {po.status === 'Ordered' && <button className="btn btn-sm btn-primary" onClick={() => receive(po)}>Receive</button>}
                    {(po.status === 'Draft' || po.status === 'Ordered') && <button className="btn btn-sm btn-danger" onClick={() => cancel(po)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
