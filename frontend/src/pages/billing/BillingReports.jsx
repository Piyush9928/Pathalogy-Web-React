import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const TABS = [
  { key: 'daily', label: 'Daily Collection', icon: 'bi-cash-coin' },
  { key: 'workload', label: 'Department Workload', icon: 'bi-diagram-3' },
  { key: 'commission', label: 'Commission Ledger', icon: 'bi-person-vcard' },
  { key: 'revenue', label: 'Revenue', icon: 'bi-graph-up-arrow' },
  { key: 'due', label: 'Due / Aging', icon: 'bi-hourglass-split' },
];

function DailyCollectionTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  useEffect(() => {
    apiClient.get('/billing-reports/daily-collection', { params: { date } }).then((res) => setData(res.data)).catch(() => {});
  }, [date]);

  return (
    <div className="lsp-panel">
      <div className="form-group" style={{ maxWidth: 200 }}>
        <label className="form-label">Date</label>
        <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {data && (
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Payment Mode</th><th>Invoices</th><th>Total Amount</th></tr></thead>
            <tbody>
              {data.byMode.length === 0 ? <tr><td colSpan={3}>No collections on this date.</td></tr> : data.byMode.map((m) => (
                <tr key={m.paymentMode}><td>{m.paymentMode}</td><td>{m.invoiceCount}</td><td>₹{m.totalAmount.toLocaleString('en-IN')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkloadTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/billing-reports/department-workload').then((res) => setData(res.data)).catch(() => {});
  }, []);
  return (
    <div className="lsp-panel">
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Department</th><th>Total Tests</th><th>Pending</th><th>Completed</th><th>Avg/Day</th></tr></thead>
          <tbody>
            {!data || data.rows.length === 0 ? <tr><td colSpan={5}>No data.</td></tr> : data.rows.map((r) => (
              <tr key={r.department || 'unassigned'}>
                <td>{r.department || 'Unassigned'}</td><td>{r.total_tests}</td><td>{r.pending_tests}</td><td>{r.completed_tests}</td><td>{r.average_per_day}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CommissionTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/billing-reports/commission-ledger').then((res) => setData(res.data)).catch(() => {});
  }, []);
  return (
    <div className="lsp-panel">
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Doctor</th><th>Specialization</th><th>Invoices</th><th>Revenue</th><th>Commission %</th><th>Commission Amount</th></tr></thead>
          <tbody>
            {!data || data.rows.length === 0 ? <tr><td colSpan={6}>No referral revenue in this period.</td></tr> : data.rows.map((r) => (
              <tr key={r.doctorId}>
                <td>{r.doctorName}</td><td>{r.specialization}</td><td>{r.invoiceCount}</td>
                <td>₹{r.revenue.toLocaleString('en-IN')}</td><td>{r.commissionPercent}%</td>
                <td style={{ fontWeight: 600 }}>₹{r.commissionAmount.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/billing-reports/revenue').then((res) => setData(res.data)).catch(() => {});
  }, []);
  return (
    <div className="dash-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="lsp-panel mb-0">
        <h3><span className="h-ico"><i className="bi bi-graph-up-arrow" /></span> Day-wise</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Date</th><th>Billed</th><th>Collected</th><th>Refunded</th></tr></thead>
            <tbody>
              {!data || data.dayPoints.length === 0 ? <tr><td colSpan={4}>No data.</td></tr> : data.dayPoints.map((d) => (
                <tr key={d.date}><td>{d.date}</td><td>₹{d.billed.toLocaleString('en-IN')}</td><td>₹{d.collected.toLocaleString('en-IN')}</td><td>₹{d.refunded.toLocaleString('en-IN')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="lsp-panel mb-0">
        <h3><span className="h-ico"><i className="bi bi-pie-chart" /></span> By Payment Mode</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(data?.modeShare || []).map((m) => (
            <li key={m.mode} className="d-flex justify-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--lsp-border)' }}>
              <span>{m.mode}</span><span>₹{m.amount.toLocaleString('en-IN')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DueTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get('/billing-reports/due').then((res) => setData(res.data)).catch(() => {});
  }, []);
  return (
    <div className="lsp-panel">
      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Patient</th><th>Invoices</th><th>Total Outstanding</th><th>0-30d</th><th>31-60d</th><th>61-90d</th><th>90+d</th></tr></thead>
          <tbody>
            {!data || data.rows.length === 0 ? <tr><td colSpan={7}>No outstanding balances.</td></tr> : data.rows.map((r) => (
              <tr key={r.patientId}>
                <td>{r.patientName} <span className="text-muted">({r.patientUhid})</span></td>
                <td>{r.invoiceCount}</td>
                <td style={{ fontWeight: 600 }}>₹{r.totalOutstanding.toLocaleString('en-IN')}</td>
                <td>₹{r.outstanding_0_30.toLocaleString('en-IN')}</td>
                <td>₹{r.outstanding_31_60.toLocaleString('en-IN')}</td>
                <td>₹{r.outstanding_61_90.toLocaleString('en-IN')}</td>
                <td className={r.outstanding_90_plus > 0 ? 'text-danger' : ''}>₹{r.outstanding_90_plus.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BillingReports() {
  const [tab, setTab] = useState('daily');

  return (
    <>
      <PageHeader title="Billing Reports" subtitle="Collections, workload, commissions, revenue, and outstanding" />

      <div className="lsp-panel" style={{ padding: '0.6rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ borderRadius: '999px' }}
              onClick={() => setTab(t.key)}
              type="button"
            >
              <i className={`bi ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'daily' && <DailyCollectionTab />}
      {tab === 'workload' && <WorkloadTab />}
      {tab === 'commission' && <CommissionTab />}
      {tab === 'revenue' && <RevenueTab />}
      {tab === 'due' && <DueTab />}
    </>
  );
}
