import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

export default function SalaryPayments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/payroll/payments', { params: { month } });
      setPayments(res.data.payments);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load salary payments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/payroll/payments/new"><i className="bi bi-plus-lg" /> Run Salary Payment</Link>
        </div>
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">₹{Number(stats.totalPaid).toLocaleString('en-IN')}</div><div className="kpi-label">Total Paid</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.pendingApproval}</div><div className="kpi-label">Pending Approval</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.count}</div><div className="kpi-label">Payments</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <input className="form-control" style={{ maxWidth: 200, marginBottom: '1rem' }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Payment #</th><th>Employee</th><th>Month</th><th>Payment Date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={6}>No salary payments found.</td></tr>
              ) : payments.map((p) => (
                <tr key={p.id} style={p.is_cancelled ? { opacity: 0.5 } : {}}>
                  <td>{p.payment_number}</td>
                  <td>{p.full_name} <span className="text-muted">({p.employee_code})</span></td>
                  <td>{new Date(p.salary_month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                  <td>{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                  <td>
                    {p.is_cancelled ? <span className="status-pill pill-neutral">Cancelled</span> : p.is_approved ? <span className="status-pill pill-teal">Approved</span> : <span className="status-pill pill-amber">Pending</span>}
                  </td>
                  <td><Link className="btn btn-sm btn-outline-secondary" to={`/payroll/payments/${p.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
