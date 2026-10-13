import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import HospitalBrand from '../../components/HospitalBrand';
import { useAuth } from '../../context/AuthContext';

export default function Payslip() {
  const { id } = useParams();
  const { hospital } = useAuth();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get(`/payroll/payments/${id}`);
      setPayment(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load payslip.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/payroll/payments/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} payment.`);
    } finally {
      setBusy(false);
    }
  }

  if (error && !payment) return <div className="auth-alert">{error}</div>;
  if (!payment) return null;

  return (
    <>
      <PageHeader
        title={`Payslip — ${payment.payment_number}`}
        subtitle={`${payment.full_name} (${payment.employee_code}) · ${new Date(payment.salary_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`}
        actions={
          <>
            {!payment.is_cancelled && !payment.is_approved && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => act('approve')}>Approve</button>
                <button className="btn btn-outline-secondary" disabled={busy} onClick={() => act('reject')}>Reject</button>
              </>
            )}
            {!payment.is_cancelled && (
              <button className="btn btn-danger" disabled={busy} onClick={() => act('cancel')}>Cancel</button>
            )}
            <button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>
          </>
        }
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <HospitalBrand hospital={hospital} nameStyle={{ fontSize: '1.1rem' }} />
          {payment.is_cancelled ? <span className="status-pill pill-neutral">Cancelled</span> : payment.is_approved ? <span className="status-pill pill-teal">Approved</span> : <span className="status-pill pill-amber">Pending Approval</span>}
        </div>

        <dl className="detail-list">
          <div><dt>Employee</dt><dd>{payment.full_name} ({payment.employee_code})</dd></div>
          <div><dt>Designation</dt><dd>{payment.designation_name || '—'}</dd></div>
          <div><dt>Salary Month</dt><dd>{new Date(payment.salary_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</dd></div>
          <div><dt>Payment Date</dt><dd>{new Date(payment.payment_date).toLocaleDateString('en-IN')} ({payment.payment_mode})</dd></div>
          <div><dt>Bank Details</dt><dd>{payment.bank_name ? `${payment.bank_name} · ${payment.bank_account_no || '—'}` : '—'}</dd></div>
          <div><dt>Working / Paid For Days</dt><dd>{payment.working_days} / {payment.paid_for_days}</dd></div>
        </dl>

        <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
          <div>
            <h4>Earnings</h4>
            <table className="lsp-table">
              <tbody>
                <tr><td>Basic Salary (prorated)</td><td style={{ textAlign: 'right' }}>₹{Number(payment.proratedBasic).toLocaleString('en-IN')}</td></tr>
                {payment.lines.filter((l) => l.type === 'Earning').map((l) => (
                  <tr key={l.id}><td>{l.head_name}</td><td style={{ textAlign: 'right' }}>₹{Number(l.amount).toLocaleString('en-IN')}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td>Total Earnings</td><td style={{ textAlign: 'right' }}>₹{payment.totalEarnings.toLocaleString('en-IN')}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4>Deductions</h4>
            <table className="lsp-table">
              <tbody>
                {payment.lines.filter((l) => l.type === 'Deduction').map((l) => (
                  <tr key={l.id}><td>{l.head_name}</td><td style={{ textAlign: 'right' }}>₹{Number(l.amount).toLocaleString('en-IN')}</td></tr>
                ))}
                <tr><td>TDS ({payment.tds_percent}%)</td><td style={{ textAlign: 'right' }}>₹{payment.taxAmount.toLocaleString('en-IN')}</td></tr>
                <tr><td>Advance Deduction</td><td style={{ textAlign: 'right' }}>₹{Number(payment.advance_deduction).toLocaleString('en-IN')}</td></tr>
                <tr style={{ fontWeight: 700 }}><td>Total Deductions</td><td style={{ textAlign: 'right' }}>₹{(payment.totalDeductions + payment.taxAmount + Number(payment.advance_deduction)).toLocaleString('en-IN')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginTop: '1rem', fontSize: '1.2rem', fontWeight: 700 }}>
          Net Payable: ₹{payment.payableSalary.toLocaleString('en-IN')}
        </div>
        {payment.remarks && <p className="text-muted" style={{ marginTop: '1rem' }}>Remarks: {payment.remarks}</p>}
      </div>
    </>
  );
}
