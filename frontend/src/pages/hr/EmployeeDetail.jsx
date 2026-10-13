import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

const CURRENT_STATUSES = ['Active', 'On Leave', 'Resigned', 'Terminated'];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [balance, setBalance] = useState(0);
  const [payments, setPayments] = useState([]);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', reason: '', paymentMode: 'Cash', drCr: 'Dr' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/employees/${id}`);
      setEmployee(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load employee.');
    }
    try {
      const advRes = await apiClient.get('/payroll/advances', { params: { employeeId: id } });
      setAdvances(advRes.data.advances);
      const bal = advRes.data.balances.find((b) => String(b.employee_id) === String(id));
      setBalance(bal ? Number(bal.balance) : 0);
    } catch { /* non-fatal */ }
    try {
      const payRes = await apiClient.get('/payroll/payments', { params: { employeeId: id } });
      setPayments(payRes.data.payments);
    } catch { /* non-fatal */ }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(status) {
    try {
      await apiClient.patch(`/employees/${id}/status`, { currentStatus: status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  }

  async function addAdvance(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/payroll/advances', { ...advanceForm, employeeId: id });
      setAdvanceForm({ amount: '', reason: '', paymentMode: 'Cash', drCr: 'Dr' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record advance.');
    }
  }

  if (error && !employee) return <div className="auth-alert">{error}</div>;
  if (!employee) return <Loader />;
  return (
    <>
      <PageHeader
        title={employee.full_name}
        subtitle={`${employee.employee_code} · ${employee.designation_name || 'No designation'}`}
        actions={
          <>
            <select className="form-select" style={{ width: 160 }} value={employee.current_status} onChange={(e) => setStatus(e.target.value)}>
              {CURRENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <Link className="btn btn-outline-secondary" to={`/hr/${id}/edit`}>Edit</Link>
          </>
        }
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <dl className="detail-list">
          <div><dt>Gender / DOB</dt><dd>{employee.gender}{employee.date_of_birth && ` · ${new Date(employee.date_of_birth).toLocaleDateString('en-IN')}`}</dd></div>
          <div><dt>Contact</dt><dd>{employee.contact_no_1 || '—'} {employee.email && `· ${employee.email}`}</dd></div>
          <div><dt>Department / Branch</dt><dd>{employee.department || '—'} {employee.branch_name && `· ${employee.branch_name}`}</dd></div>
          <div><dt>Joining Date</dt><dd>{new Date(employee.joining_date).toLocaleDateString('en-IN')}</dd></div>
          <div><dt>Employee Type</dt><dd><span className="status-pill pill-neutral">{employee.employee_type}</span></dd></div>
          <div><dt>Monthly Salary</dt><dd>₹{Number(employee.monthly_salary).toLocaleString('en-IN')} ({employee.mode_of_payment})</dd></div>
          {employee.linked_user_name && <div><dt>Linked Login</dt><dd>{employee.linked_user_name}</dd></div>}
          <div><dt>PF / ESI</dt><dd>{employee.is_pf ? `PF: ${employee.pf_number || 'Yes'}` : 'No PF'} · {employee.is_esi ? `ESI: ${employee.esi_number || 'Yes'}` : 'No ESI'}</dd></div>
          <div><dt>Bank</dt><dd>{employee.bank_name ? `${employee.bank_name} · ${employee.bank_account_no || '—'}` : '—'}</dd></div>
          <div><dt>Advance Balance</dt><dd className={balance > 0 ? 'text-danger' : ''}>₹{balance.toLocaleString('en-IN')}</dd></div>
        </dl>
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '2fr 3fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-cash-stack" /></span> Advances</h3>
          <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
            <table className="lsp-table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Reason</th></tr></thead>
              <tbody>
                {advances.length === 0 ? <tr><td colSpan={4}>No advances recorded.</td></tr> : advances.map((a) => (
                  <tr key={a.id} style={a.is_cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                    <td>{new Date(a.advance_date).toLocaleDateString('en-IN')}</td>
                    <td><span className={`status-pill ${a.dr_cr === 'Dr' ? 'pill-danger' : 'pill-teal'}`}>{a.dr_cr === 'Dr' ? 'Advance' : 'Repayment'}</span></td>
                    <td>₹{Number(a.amount).toLocaleString('en-IN')}</td>
                    <td>{a.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={addAdvance} className="row-g">
            <select className="form-select" style={{ flex: '1 1 120px' }} value={advanceForm.drCr} onChange={(e) => setAdvanceForm({ ...advanceForm, drCr: e.target.value })}>
              <option value="Dr">Advance</option>
              <option value="Cr">Repayment</option>
            </select>
            <input className="form-control" type="number" style={{ flex: '1 1 100px' }} placeholder="Amount" value={advanceForm.amount} onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })} />
            <input className="form-control" style={{ flex: '2 1 160px' }} placeholder="Reason" value={advanceForm.reason} onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })} />
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-receipt" /></span> Salary Payment History</h3>
          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th>Month</th><th>Payment #</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {payments.length === 0 ? <tr><td colSpan={4}>No salary payments yet.</td></tr> : payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.salary_month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                    <td>{p.payment_number}</td>
                    <td>
                      {p.is_cancelled ? <span className="status-pill pill-neutral">Cancelled</span> : p.is_approved ? <span className="status-pill pill-teal">Approved</span> : <span className="status-pill pill-amber">Pending</span>}
                    </td>
                    <td><Link className="btn btn-sm btn-outline-secondary" to={`/payroll/payments/${p.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="btn btn-outline-secondary mt-2" to={`/payroll/payments/new?employeeId=${id}`}><i className="bi bi-plus-lg" /> Run Salary Payment</Link>
        </div>
      </div>
    </>
  );
}
