import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_ACCOUNT_FORM = { ledgerAccountId: '', bankName: '', accountNumber: '', ifsc: '', branchName: '' };
const EMPTY_STATEMENT_FORM = { fromDate: '', toDate: '', openingBalance: 0, closingBalance: 0 };
const EMPTY_TXN = { date: '', description: '', debitAmount: '', creditAmount: '' };

export default function BankReconciliation() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [ledgerAccounts, setLedgerAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [statementForm, setStatementForm] = useState(EMPTY_STATEMENT_FORM);
  const [txns, setTxns] = useState([{ ...EMPTY_TXN }]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadAccounts() {
    try {
      const res = await apiClient.get('/bank-reconciliation/accounts');
      setBankAccounts(res.data.bankAccounts);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bank accounts.');
    }
    apiClient.get('/accounting/accounts').then((res) => setLedgerAccounts(res.data.accounts.filter((a) => a.cash_bank_type === 'Bank'))).catch(() => {});
  }

  useEffect(() => { loadAccounts(); }, []);

  async function selectAccount(acc) {
    setSelected(acc);
    try {
      const res = await apiClient.get(`/bank-reconciliation/accounts/${acc.id}/report`);
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reconciliation report.');
    }
  }

  async function createBankAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/bank-reconciliation/accounts', accountForm);
      setAccountForm(EMPTY_ACCOUNT_FORM);
      setShowAccountForm(false);
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add bank account.');
    }
  }

  function updateTxn(idx, field, value) {
    setTxns((ts) => ts.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function importStatement(e) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!selected) return;
    try {
      await apiClient.post(`/bank-reconciliation/accounts/${selected.id}/statements`, {
        ...statementForm, transactions: txns.filter((t) => t.date && (t.debitAmount || t.creditAmount)),
      });
      setStatementForm(EMPTY_STATEMENT_FORM);
      setTxns([{ ...EMPTY_TXN }]);
      setShowStatementForm(false);
      setMessage('Statement imported.');
      await selectAccount(selected);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to import statement.');
    }
  }

  async function autoMatch() {
    setError(''); setMessage('');
    try {
      const res = await apiClient.post(`/bank-reconciliation/accounts/${selected.id}/auto-match`, { toleranceDays: 3 });
      setMessage(`${res.data.matchedCount} transaction(s) auto-matched.`);
      await selectAccount(selected);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to auto-match.');
    }
  }

  async function unmatch(txnId) {
    try {
      await apiClient.post(`/bank-reconciliation/transactions/${txnId}/unmatch`);
      await selectAccount(selected);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unmatch.');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bank Reconciliation</h1>
          <p className="page-subtitle">Bank accounts, statement entry, and transaction matching.</p>
        </div>
      </div>

      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <div className="lsp-panel mb-0">
          <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
            <h3 className="mb-0">Bank Accounts</h3>
            <button className="btn btn-sm btn-primary" type="button" onClick={() => setShowAccountForm((s) => !s)}><i className="bi bi-plus-lg" /></button>
          </div>

          {showAccountForm && (
            <form onSubmit={createBankAccount} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none', padding: '0.6rem' }}>
              <div className="form-group">
                <label className="form-label">Ledger Account (Bank-type) *</label>
                <select className="form-select" required value={accountForm.ledgerAccountId} onChange={(e) => setAccountForm({ ...accountForm, ledgerAccountId: e.target.value })}>
                  <option value="">Select account</option>
                  {ledgerAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Bank Name *</label>
                <input className="form-control" required value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Account Number *</label>
                <input className="form-control" required value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Save</button>
            </form>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {bankAccounts.map((acc) => (
              <li key={acc.id} style={{ marginBottom: '0.4rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm w-100 text-start ${selected?.id === acc.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => selectAccount(acc)}
                >
                  {acc.bank_name} · {acc.account_number}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lsp-panel mb-0">
          {!selected ? (
            <p className="text-muted">Select a bank account to view its reconciliation.</p>
          ) : (
            <>
              <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
                <h3 className="mb-0">{selected.bank_name} — {selected.account_number}</h3>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowStatementForm((s) => !s)}><i className="bi bi-upload" /> Import Statement</button>
                  <button className="btn btn-outline-secondary btn-sm" onClick={autoMatch}><i className="bi bi-magic" /> Auto-Match</button>
                </div>
              </div>

              {showStatementForm && (
                <form onSubmit={importStatement} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
                  <div className="row-g">
                    <div className="form-group" style={{ flex: '1 1 140px' }}>
                      <label className="form-label">From *</label>
                      <input className="form-control" type="date" required value={statementForm.fromDate} onChange={(e) => setStatementForm({ ...statementForm, fromDate: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 140px' }}>
                      <label className="form-label">To *</label>
                      <input className="form-control" type="date" required value={statementForm.toDate} onChange={(e) => setStatementForm({ ...statementForm, toDate: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 140px' }}>
                      <label className="form-label">Opening Balance</label>
                      <input className="form-control" type="number" value={statementForm.openingBalance} onChange={(e) => setStatementForm({ ...statementForm, openingBalance: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 140px' }}>
                      <label className="form-label">Closing Balance</label>
                      <input className="form-control" type="number" value={statementForm.closingBalance} onChange={(e) => setStatementForm({ ...statementForm, closingBalance: e.target.value })} />
                    </div>
                  </div>

                  <h4>Transactions</h4>
                  {txns.map((t, idx) => (
                    <div className="row-g" key={idx} style={{ marginBottom: '0.4rem' }}>
                      <input className="form-control" style={{ flex: '1 1 130px' }} type="date" value={t.date} onChange={(e) => updateTxn(idx, 'date', e.target.value)} />
                      <input className="form-control" style={{ flex: '2 1 180px' }} placeholder="Description" value={t.description} onChange={(e) => updateTxn(idx, 'description', e.target.value)} />
                      <input className="form-control" style={{ flex: '1 1 110px' }} type="number" placeholder="Debit" value={t.debitAmount} onChange={(e) => updateTxn(idx, 'debitAmount', e.target.value)} />
                      <input className="form-control" style={{ flex: '1 1 110px' }} type="number" placeholder="Credit" value={t.creditAmount} onChange={(e) => updateTxn(idx, 'creditAmount', e.target.value)} />
                    </div>
                  ))}
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setTxns((ts) => [...ts, { ...EMPTY_TXN }])} style={{ marginBottom: '0.8rem' }}>
                    <i className="bi bi-plus-lg" /> Add Row
                  </button>
                  <br />
                  <button className="btn btn-primary" type="submit">Save Statement</button>
                </form>
              )}

              {report && (
                <>
                  <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))', marginBottom: '1rem' }}>
                    <div className="kpi-card"><div className="kpi-value">{report.summary.matched}</div><div className="kpi-label">Matched</div></div>
                    <div className="kpi-card"><div className="kpi-value text-danger">{report.summary.unmatched}</div><div className="kpi-label">Unmatched</div></div>
                    <div className="kpi-card"><div className="kpi-value">₹{Number(report.summary.unmatchedAmount).toLocaleString('en-IN')}</div><div className="kpi-label">Unmatched Amount</div></div>
                  </div>
                  <div className="lsp-table-wrapper">
                    <table className="lsp-table">
                      <thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {report.transactions.length === 0 ? <tr><td colSpan={6}>No transactions imported yet.</td></tr> : report.transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{new Date(t.transaction_date).toLocaleDateString('en-IN')}</td>
                            <td>{t.description || '—'}</td>
                            <td>{Number(t.debit_amount) > 0 ? `₹${Number(t.debit_amount).toLocaleString('en-IN')}` : ''}</td>
                            <td>{Number(t.credit_amount) > 0 ? `₹${Number(t.credit_amount).toLocaleString('en-IN')}` : ''}</td>
                            <td><span className={`status-pill ${t.is_matched ? 'pill-teal' : 'pill-amber'}`}>{t.is_matched ? 'Matched' : 'Unmatched'}</span></td>
                            <td>{t.is_matched && <button className="btn btn-sm btn-outline-secondary" onClick={() => unmatch(t.id)}>Unmatch</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
