import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function StockLedger() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [entries, setEntries] = useState([]);
  const [quantityChange, setQuantityChange] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [itemRes, ledgerRes] = await Promise.all([
        apiClient.get(`/inventory/${id}`),
        apiClient.get(`/inventory/${id}/stock-ledger`),
      ]);
      setItem(itemRes.data);
      setEntries(ledgerRes.data.entries);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load stock ledger.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdjust(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/inventory/${id}/adjust-stock`, { quantityChange: Number(quantityChange), reason });
      setQuantityChange('');
      setReason('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to adjust stock.');
    }
  }

  if (error && !item) return <div className="auth-alert">{error}</div>;
  if (!item) return null;

  return (
    <>
      <PageHeader title={`Stock Ledger — ${item.name}`} subtitle={`Current stock: ${item.current_stock} ${item.unit}`} />
      {error && <div className="auth-alert">{error}</div>}

      <div className="dash-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-list-columns" /></span> Movement History</h3>
          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th>Date</th><th>Type</th><th>Change</th><th>Balance</th><th>Reference</th><th>By</th></tr></thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={6}>No movements recorded yet.</td></tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.happened_at).toLocaleString('en-IN')}</td>
                      <td>{e.transaction_type}</td>
                      <td className={e.quantity_change < 0 ? 'text-danger' : 'text-success'}>{e.quantity_change > 0 ? '+' : ''}{e.quantity_change}</td>
                      <td>{e.balance_after}</td>
                      <td>{e.reference || '—'}</td>
                      <td>{e.performed_by || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={handleAdjust} className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-sliders" /></span> Adjust Stock</h3>
          <div className="form-group">
            <label className="form-label">Quantity Change</label>
            <input className="form-control" type="number" required placeholder="e.g. -5 or 20" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} />
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>Positive to add stock, negative to remove.</p>
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit">Apply Adjustment</button>
        </form>
      </div>
    </>
  );
}
