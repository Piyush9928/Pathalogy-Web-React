import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [todaysTotal, setTodaysTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/pharmacy/sales', { params: { search } });
      setSales(res.data.sales);
      setTodaysTotal(res.data.todaysTotal);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sales.');
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
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(1, minmax(160px, 220px))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value">₹{todaysTotal.toLocaleString('en-IN')}</div><div className="kpi-label">Today's Collection</div></div>
      </div>

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="Search by sale # or customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Sale #</th><th>Customer</th><th>Date</th><th>Payment Mode</th><th>Paid</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={6}>No sales found.</td></tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.sale_number}</td>
                    <td>{s.patient_name || s.walk_in_name}</td>
                    <td>{new Date(s.sale_date).toLocaleString('en-IN')}</td>
                    <td>{s.payment_mode}</td>
                    <td>₹{Number(s.paid_amount).toLocaleString('en-IN')}</td>
                    <td><Link className="btn btn-sm btn-outline-secondary" to={`/pharmacy/sales/${s.id}`}>View</Link></td>
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
