import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

const EMPTY_FORM = { itemCode: '', name: '', category: 'Tablet', manufacturer: '', gstPercent: 12, unit: 'Strip', minimumStock: 10, mrp: 0, brandType: 'Branded' };

export default function MedicineItems() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/pharmacy/items', { params: { search } });
      setItems(res.data.items);
      setStats(res.data.stats);
      setCategories(res.data.categories);
      setUnits(res.data.units);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load medicine items.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/pharmacy/items', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create item.');
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await apiClient.delete(`/pharmacy/items/${item.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete item.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.totalItems}</div><div className="kpi-label">Total Items</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.lowStock}</div><div className="kpi-label">Low Stock</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.expiredBatches}</div><div className="kpi-label">Items w/ Expired Batch</div></div>
          <div className="kpi-card"><div className="kpi-value">₹{stats.totalStockValue.toLocaleString('en-IN')}</div><div className="kpi-label">Total Stock Value</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search by name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Medicine</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Item Code *</label>
                <input className="form-control" required value={form.itemCode} onChange={(e) => setForm({ ...form, itemCode: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Unit</label>
                <select className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {units.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Manufacturer</label>
                <input className="form-control" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">GST %</label>
                <input className="form-control" type="number" value={form.gstPercent} onChange={(e) => setForm({ ...form, gstPercent: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">MRP (₹)</label>
                <input className="form-control" type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Min. Stock</label>
                <input className="form-control" type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Brand Type</label>
                <select className="form-select" value={form.brandType} onChange={(e) => setForm({ ...form, brandType: e.target.value })}>
                  <option>Generic</option><option>Branded</option><option>OTC</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Medicine</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Stock</th><th>MRP</th><th>Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><Loader compact /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}>No medicine items found.</td></tr>
              ) : (
                items.map((item) => (
                  <>
                    <tr key={item.id}>
                      <td>{item.item_code}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-secondary" style={{ padding: '0.1rem 0.4rem', marginRight: '0.4rem' }} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                          <i className={`bi ${expandedId === item.id ? 'bi-chevron-down' : 'bi-chevron-right'}`} />
                        </button>
                        {item.name}
                      </td>
                      <td>{item.category}</td>
                      <td className={item.is_low_stock ? 'text-danger' : ''}>{item.current_stock} {item.unit}</td>
                      <td>₹{Number(item.latest_mrp).toLocaleString('en-IN')}</td>
                      <td>₹{item.stock_value.toLocaleString('en-IN')}</td>
                      <td>
                        {item.has_expired_batch && <span className="status-pill pill-danger">Expired batch</span>}
                        {!item.has_expired_batch && item.has_expiring_batch && <span className="status-pill pill-warning">Expiring soon</span>}
                        {!item.has_expired_batch && !item.has_expiring_batch && item.is_low_stock && <span className="status-pill pill-warning">Low stock</span>}
                        {!item.has_expired_batch && !item.has_expiring_batch && !item.is_low_stock && <span className="status-pill pill-success">OK</span>}
                      </td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(item)}>Delete</button></td>
                    </tr>
                    {expandedId === item.id && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--lsp-surface-alt)' }}>
                          <strong>Batches:</strong>
                          {item.batches.length === 0 ? ' None' : (
                            <table className="lsp-table" style={{ marginTop: '0.5rem' }}>
                              <thead><tr><th>Batch No.</th><th>Expiry</th><th>Qty</th><th>Rate</th><th>MRP</th></tr></thead>
                              <tbody>
                                {item.batches.map((b) => (
                                  <tr key={b.id}>
                                    <td>{b.batch_no}</td>
                                    <td>{new Date(b.expiry_date).toLocaleDateString('en-IN')}</td>
                                    <td>{b.quantity}</td>
                                    <td>₹{Number(b.purchase_rate).toLocaleString('en-IN')}</td>
                                    <td>₹{Number(b.mrp).toLocaleString('en-IN')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
