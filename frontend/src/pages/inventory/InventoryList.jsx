import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

function statusPill(item) {
  if (item.is_expired) return { cls: 'pill-danger', label: 'Expired' };
  if (item.is_low_stock) return { cls: 'pill-warning', label: 'Low Stock' };
  if (item.is_expiring_soon) return { cls: 'pill-warning', label: 'Expiring Soon' };
  return { cls: 'pill-success', label: 'In Stock' };
}

export default function InventoryList() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/inventory', { params: { search } });
      setItems(res.data.items);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await apiClient.delete(`/inventory/${item.id}`);
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
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.lowStock}</div><div className="kpi-label">Below Minimum Stock</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.expiringSoon}</div><div className="kpi-label">Expiring in 60 Days</div>{stats.expired > 0 && <div className="kpi-foot text-danger">{stats.expired} expired</div>}</div>
          <div className="kpi-card"><div className="kpi-value">₹{stats.totalStockValue.toLocaleString('en-IN')}</div><div className="kpi-label">Total Stock Value</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 260 }} placeholder="Search by name, code, category..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <Link className="btn btn-primary" to="/inventory/new"><i className="bi bi-plus-lg" /> New Item</Link>
        </div>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Stock</th><th>Min.</th><th>Unit Cost</th><th>Value</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10}>No inventory items found.</td></tr>
              ) : (
                items.map((item) => {
                  const pill = statusPill(item);
                  return (
                    <tr key={item.id}>
                      <td>{item.item_code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        {item.supplier_name && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{item.supplier_name}</div>}
                      </td>
                      <td><span className="status-pill pill-neutral">{item.category}</span></td>
                      <td className={item.is_low_stock ? 'text-danger' : ''}>{item.current_stock} {item.unit}</td>
                      <td>{item.minimum_stock}</td>
                      <td>₹{Number(item.unit_cost).toLocaleString('en-IN')}</td>
                      <td>₹{item.stock_value.toLocaleString('en-IN')}</td>
                      <td>{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td><span className={`status-pill ${pill.cls}`}>{pill.label}</span></td>
                      <td className="d-flex gap-2">
                        <Link className="btn btn-sm btn-outline-secondary" to={`/inventory/${item.id}/ledger`}>Ledger</Link>
                        <Link className="btn btn-sm btn-outline-secondary" to={`/inventory/${item.id}/edit`}>Edit</Link>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item)}>Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
