import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

const TABS = [
  { key: 'stock', label: 'Stock Balance', icon: 'bi-box-seam' },
  { key: 'expiry', label: 'Expiry Report', icon: 'bi-exclamation-triangle' },
  { key: 'sales', label: 'Sales Register', icon: 'bi-receipt' },
];

function bucketPill(bucket) {
  if (bucket === 'Already Expired') return 'pill-danger';
  if (bucket === '0-30 Days') return 'pill-danger';
  if (bucket === '31-60 Days') return 'pill-warning';
  return 'pill-neutral';
}

function StockBalanceTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/pharmacy/reports/stock-balance').then((res) => setData(res.data)).catch(() => {});
  }, []);
  if (!data) return <Loader />;
  return (
    <div className="lsp-panel">
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value">{data.totals.totalQuantity}</div><div className="kpi-label">Total Quantity</div></div>
        <div className="kpi-card"><div className="kpi-value">₹{data.totals.totalValue.toLocaleString('en-IN')}</div><div className="kpi-label">Total Value</div></div>
        <div className="kpi-card"><div className="kpi-value text-danger">{data.totals.expiredCount}</div><div className="kpi-label">Expired Batches</div></div>
        <div className="kpi-card"><div className="kpi-value">{data.totals.expiringCount}</div><div className="kpi-label">Expiring Soon</div></div>
      </div>
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Rate</th><th>Value</th></tr></thead>
          <tbody>
            {data.rows.length === 0 ? <tr><td colSpan={6}>No stock found.</td></tr> : data.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.item_name}</td><td>{r.batch_no}</td><td>{new Date(r.expiry_date).toLocaleDateString('en-IN')}</td>
                <td>{r.quantity}</td><td>₹{Number(r.purchase_rate).toLocaleString('en-IN')}</td><td>₹{r.value.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpiryReportTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/pharmacy/reports/expiry').then((res) => setData(res.data)).catch(() => {});
  }, []);
  if (!data) return <Loader />;
  return (
    <div className="lsp-panel">
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th>Days to Expiry</th><th>Qty</th><th>Bucket</th></tr></thead>
          <tbody>
            {data.rows.length === 0 ? <tr><td colSpan={6}>No batches found.</td></tr> : data.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.item_name}</td><td>{r.batch_no}</td><td>{new Date(r.expiry_date).toLocaleDateString('en-IN')}</td>
                <td>{r.days_to_expiry}</td><td>{r.quantity}</td>
                <td><span className={`status-pill ${bucketPill(r.bucket)}`}>{r.bucket}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalesRegisterTab() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    apiClient.get('/pharmacy/reports/sales-register', { params: { from, to } }).then((res) => setData(res.data)).catch(() => {});
  }, [from, to]);

  if (!data) return <Loader />;
  return (
    <div className="lsp-panel">
      <div className="row-g" style={{ marginBottom: '1rem' }}>
        <div className="form-group" style={{ flex: '1 1 160px' }}><label className="form-label">From</label><input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group" style={{ flex: '1 1 160px' }}><label className="form-label">To</label><input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value">{data.totals.saleCount}</div><div className="kpi-label">Sales</div></div>
        <div className="kpi-card"><div className="kpi-value">₹{data.totals.grossAmount.toLocaleString('en-IN')}</div><div className="kpi-label">Gross</div></div>
        <div className="kpi-card"><div className="kpi-value">₹{data.totals.gstAmount.toLocaleString('en-IN')}</div><div className="kpi-label">GST</div></div>
        <div className="kpi-card"><div className="kpi-value">₹{data.totals.netAmount.toLocaleString('en-IN')}</div><div className="kpi-label">Net</div></div>
      </div>
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Sale #</th><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>GST</th><th>Net</th></tr></thead>
          <tbody>
            {data.rows.length === 0 ? <tr><td colSpan={7}>No sales in this period.</td></tr> : data.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.sale_number}</td><td>{r.item_name}</td><td>{r.quantity}</td><td>₹{Number(r.rate).toLocaleString('en-IN')}</td>
                <td>₹{r.discountAmount.toLocaleString('en-IN')}</td><td>₹{r.gstAmount.toLocaleString('en-IN')}</td><td>₹{r.netAmount.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PharmacyReports() {
  const [tab, setTab] = useState('stock');

  return (
    <>
      <div className="lsp-panel" style={{ padding: '0.6rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ borderRadius: '999px' }} onClick={() => setTab(t.key)}>
              <i className={`bi ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stock' && <StockBalanceTab />}
      {tab === 'expiry' && <ExpiryReportTab />}
      {tab === 'sales' && <SalesRegisterTab />}
    </>
  );
}
