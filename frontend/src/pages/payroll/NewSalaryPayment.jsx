import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function NewSalaryPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(searchParams.get('employeeId') || '');
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0, 7));
  const [days, setDays] = useState({ workingDays: 30, absentDays: 0, leaveDays: 0, punishmentDays: 0, overTimeDays: 0, paidLeaveDays: 0, paidForDays: 30 });
  const [advanceDeduction, setAdvanceDeduction] = useState(0);
  const [tdsPercent, setTdsPercent] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [remarks, setRemarks] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/employees', { params: { status: 'Active' } }).then((res) => setEmployees(res.data.employees)).catch(() => {});
  }, []);

  async function loadPreview() {
    if (!employeeId) return setPreview(null);
    try {
      const res = await apiClient.get(`/payroll/preview/${employeeId}`, { params: { workingDays: days.workingDays, paidForDays: days.paidForDays } });
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load preview.');
    }
  }

  useEffect(() => { loadPreview(); }, [employeeId, days.workingDays, days.paidForDays]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!employeeId) return setError('Select an employee.');
    setSaving(true);
    try {
      const res = await apiClient.post('/payroll/payments', {
        employeeId, salaryMonth, basicSalary: preview?.basicSalary, ...days, advanceDeduction, tdsPercent, paymentMode, remarks,
        lines: preview?.lines || [],
      });
      navigate(`/payroll/payments/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create salary payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Run Salary Payment" />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Employee *</label>
            <select className="form-select" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.employee_code}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Salary Month *</label>
            <input className="form-control" type="month" required value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Payment Mode</label>
            <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option>Bank Transfer</option><option>Cash</option><option>Cheque</option>
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: '1rem' }}><span className="h-ico"><i className="bi bi-calendar-week" /></span> Attendance for the Month</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Working Days</label>
            <input className="form-control" type="number" value={days.workingDays} onChange={(e) => setDays({ ...days, workingDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Absent Days</label>
            <input className="form-control" type="number" value={days.absentDays} onChange={(e) => setDays({ ...days, absentDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Leave Days</label>
            <input className="form-control" type="number" value={days.leaveDays} onChange={(e) => setDays({ ...days, leaveDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Paid Leave Days</label>
            <input className="form-control" type="number" value={days.paidLeaveDays} onChange={(e) => setDays({ ...days, paidLeaveDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Punishment Days</label>
            <input className="form-control" type="number" value={days.punishmentDays} onChange={(e) => setDays({ ...days, punishmentDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Overtime Days</label>
            <input className="form-control" type="number" step="0.5" value={days.overTimeDays} onChange={(e) => setDays({ ...days, overTimeDays: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Paid For Days *</label>
            <input className="form-control" type="number" value={days.paidForDays} onChange={(e) => setDays({ ...days, paidForDays: e.target.value })} />
          </div>
        </div>

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Advance Deduction (₹)</label>
            <input className="form-control" type="number" value={advanceDeduction} onChange={(e) => setAdvanceDeduction(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">TDS %</label>
            <input className="form-control" type="number" step="0.01" value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea className="form-control" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        {preview && (
          <div className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <h3><span className="h-ico"><i className="bi bi-calculator" /></span> Live Preview</h3>
            <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
              <table className="lsp-table">
                <thead><tr><th>Head</th><th>Type</th><th>Amount</th></tr></thead>
                <tbody>
                  <tr><td>Basic Salary (prorated)</td><td><span className="status-pill pill-teal">Earning</span></td><td>₹{preview.proratedBasic.toLocaleString('en-IN')}</td></tr>
                  {preview.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td>{l.head_name}</td>
                      <td><span className={`status-pill ${l.type === 'Earning' ? 'pill-teal' : 'pill-danger'}`}>{l.type}</span></td>
                      <td>₹{Number(l.amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="detail-list">
              <div><dt>Total Earnings</dt><dd>₹{preview.totalEarnings.toLocaleString('en-IN')}</dd></div>
              <div><dt>Total Deductions</dt><dd>₹{preview.totalDeductions.toLocaleString('en-IN')}</dd></div>
              <div><dt>Net Before Tax</dt><dd>₹{preview.netSalaryBeforeTax.toLocaleString('en-IN')}</dd></div>
              <div><dt>TDS ({tdsPercent}%)</dt><dd>₹{((preview.netSalaryBeforeTax * (tdsPercent || 0)) / 100).toFixed(2)}</dd></div>
              <div><dt>Advance Deduction</dt><dd>₹{Number(advanceDeduction || 0).toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-primary">Payable Salary</dt><dd style={{ fontWeight: 700 }}>₹{(preview.netSalaryBeforeTax - (preview.netSalaryBeforeTax * (tdsPercent || 0)) / 100 - Number(advanceDeduction || 0)).toFixed(2)}</dd></div>
            </dl>
          </div>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving || !preview}>{saving ? 'Saving...' : 'Save Salary Payment'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
