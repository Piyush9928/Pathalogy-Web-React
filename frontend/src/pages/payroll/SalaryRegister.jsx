import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function SalaryRegister() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/payroll/salary-register', { params: { month } });
      setRows(res.data.rows);
      setTotals(res.data.totals);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load salary register.');
    }
  }

  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-table" /></span> Salary Register</h3>
        <div className="d-flex gap-2">
          <input className="form-control" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}

      {totals && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">₹{totals.totalEarnings.toLocaleString('en-IN')}</div><div className="kpi-label">Total Earnings</div></div>
          <div className="kpi-card"><div className="kpi-value">₹{totals.totalDeductions.toLocaleString('en-IN')}</div><div className="kpi-label">Total Deductions</div></div>
          <div className="kpi-card"><div className="kpi-value">₹{totals.payableSalary.toLocaleString('en-IN')}</div><div className="kpi-label">Total Payable</div></div>
        </div>
      )}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Employee</th><th>Designation</th><th>Basic</th><th>Earnings</th><th>Deductions</th><th>Payable</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6}>No salary payments for this month.</td></tr> : rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name} <span className="text-muted">({r.employee_code})</span></td>
                <td>{r.designation_name || '—'}</td>
                <td>₹{r.proratedBasic.toLocaleString('en-IN')}</td>
                <td>₹{r.totalEarnings.toLocaleString('en-IN')}</td>
                <td>₹{r.totalDeductions.toLocaleString('en-IN')}</td>
                <td style={{ fontWeight: 700 }}>₹{r.payableSalary.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
