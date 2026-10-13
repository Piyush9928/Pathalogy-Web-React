import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [openingForm, setOpeningForm] = useState({ walletId: '', amount: '' });
  const [transferForm, setTransferForm] = useState({ fromWalletId: '', toWalletId: '', amount: '', remarks: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/payroll/wallets');
      setWallets(res.data.wallets);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load wallets.');
    }
  }

  useEffect(() => { load(); }, []);

  async function addOpening(e) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!openingForm.walletId || !openingForm.amount) return setError('Select a wallet and enter an amount.');
    try {
      await apiClient.post(`/payroll/wallets/${openingForm.walletId}/opening`, { amount: openingForm.amount });
      setOpeningForm({ walletId: '', amount: '' });
      setMessage('Opening balance added.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add opening balance.');
    }
  }

  async function transfer(e) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await apiClient.post('/payroll/wallets/transfer', transferForm);
      setTransferForm({ fromWalletId: '', toWalletId: '', amount: '', remarks: '' });
      setMessage('Transfer initiated — awaiting acceptance.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initiate transfer.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <form onSubmit={addOpening} className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-wallet2" /></span> Add Opening Balance</h3>
          <div className="form-group">
            <label className="form-label">Wallet *</label>
            <select className="form-select" value={openingForm.walletId} onChange={(e) => setOpeningForm({ ...openingForm, walletId: e.target.value })}>
              <option value="">Select employee wallet</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.full_name} ({w.employee_code})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (₹) *</label>
            <input className="form-control" type="number" value={openingForm.amount} onChange={(e) => setOpeningForm({ ...openingForm, amount: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Add</button>
        </form>

        <form onSubmit={transfer} className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-arrow-left-right" /></span> Transfer Between Wallets</h3>
          <div className="row-g">
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">From *</label>
              <select className="form-select" value={transferForm.fromWalletId} onChange={(e) => setTransferForm({ ...transferForm, fromWalletId: e.target.value })}>
                <option value="">Select wallet</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.full_name} (₹{Number(w.balance).toLocaleString('en-IN')})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">To *</label>
              <select className="form-select" value={transferForm.toWalletId} onChange={(e) => setTransferForm({ ...transferForm, toWalletId: e.target.value })}>
                <option value="">Select wallet</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (₹) *</label>
            <input className="form-control" type="number" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={transferForm.remarks} onChange={(e) => setTransferForm({ ...transferForm, remarks: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Initiate Transfer</button>
        </form>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-wallet2" /></span> Employee Wallet Balances</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Employee</th><th>Balance</th></tr></thead>
            <tbody>
              {wallets.length === 0 ? <tr><td colSpan={2}>No wallets found.</td></tr> : wallets.map((w) => (
                <tr key={w.id}>
                  <td>{w.full_name} <span className="text-muted">({w.employee_code})</span></td>
                  <td>₹{Number(w.balance).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
