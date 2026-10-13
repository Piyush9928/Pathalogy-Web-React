import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { expenseDate: new Date().toISOString().slice(0, 10), expenseHeadAccountId: '', paidTo: '', amount: '', paymentMode: 'Cash', paidByAccountId: '', narration: '' };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/accounting/expenses');
      setExpenses(res.data.expenses);
      setPaymentModes(res.data.paymentModes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expenses.');
    }
    apiClient.get('/accounting/accounts').then((res) => setAccounts(res.data.accounts)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!form.expenseHeadAccountId || !form.amount) return setError('Expense head and amount are required.');
    try {
      await apiClient.post('/accounting/expenses', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record expense.');
    }
  }

  async function cancelExpense(exp) {
    if (!window.confirm(`Cancel expense "${exp.receipt_number}"?`)) return;
    try {
      await apiClient.post(`/accounting/expenses/${exp.id}/cancel`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel expense.');
    }
  }

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-receipt-cutoff" /></span> Expenses</h3>
        <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Expense</button>
      </div>
      {error && <div className="auth-alert">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
          <div className="row-g">
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Date</label>
              <input className="form-control" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label className="form-label">Expense Head *</label>
              <select className="form-select" required value={form.expenseHeadAccountId} onChange={(e) => setForm({ ...form, expenseHeadAccountId: e.target.value })}>
                <option value="">Select account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 180px' }}>
              <label className="form-label">Paid To</label>
              <input className="form-control" value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} />
            </div>
          </div>
          <div className="row-g">
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label className="form-label">Amount (₹) *</label>
              <input className="form-control" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {paymentModes.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label className="form-label">Paid From (account)</label>
              <select className="form-select" value={form.paidByAccountId} onChange={(e) => setForm({ ...form, paidByAccountId: e.target.value })}>
                <option value="">None</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Narration</label>
            <input className="form-control" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Save Expense</button>
        </form>
      )}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Receipt #</th><th>Date</th><th>Head</th><th>Paid To</th><th>Amount</th><th>Mode</th><th></th></tr></thead>
          <tbody>
            {expenses.length === 0 ? <tr><td colSpan={7}>No expenses recorded.</td></tr> : expenses.map((exp) => (
              <tr key={exp.id} style={exp.is_cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                <td>{exp.receipt_number}</td>
                <td>{new Date(exp.expense_date).toLocaleDateString('en-IN')}</td>
                <td>{exp.expense_head_name}</td>
                <td>{exp.paid_to || '—'}</td>
                <td>₹{Number(exp.amount).toLocaleString('en-IN')}</td>
                <td>{exp.payment_mode}</td>
                <td>{!exp.is_cancelled && <button className="btn btn-sm btn-danger" onClick={() => cancelExpense(exp)}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
