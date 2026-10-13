import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

const EMPTY_GROUP_FORM = { name: '', code: '', nature: 'Assets', cashBankType: 'None' };
const EMPTY_ACCOUNT_FORM = { name: '', code: '', groupId: '', openingBalance: 0, openingBalanceType: 'Dr', contactPerson: '', phone: '', email: '', gstin: '' };

export default function ChartOfAccounts() {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [natures, setNatures] = useState([]);
  const [cashBankTypes, setCashBankTypes] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const groupsRes = await apiClient.get('/accounting/groups');
      setGroups(groupsRes.data.groups);
      setNatures(groupsRes.data.natures);
      setCashBankTypes(groupsRes.data.cashBankTypes);
      const accountsRes = await apiClient.get('/accounting/accounts');
      setAccounts(accountsRes.data.accounts);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load chart of accounts.');
    }
  }

  useEffect(() => { load(); }, []);

  async function createGroup(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/accounting/groups', groupForm);
      setGroupForm(EMPTY_GROUP_FORM);
      setShowGroupForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account group.');
    }
  }

  async function deleteGroup(g) {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try {
      await apiClient.delete(`/accounting/groups/${g.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group.');
    }
  }

  async function createAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/accounting/accounts', accountForm);
      setAccountForm(EMPTY_ACCOUNT_FORM);
      setShowAccountForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create ledger account.');
    }
  }

  async function deleteAccount(a) {
    if (!window.confirm(`Delete account "${a.name}"?`)) return;
    try {
      await apiClient.delete(`/accounting/accounts/${a.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete account.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-diagram-3" /></span> Account Groups</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowGroupForm((s) => !s)}><i className="bi bi-plus-lg" /> New Group</button>
        </div>

        {showGroupForm && (
          <form onSubmit={createGroup} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={groupForm.code} onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Nature</label>
                <select className="form-select" value={groupForm.nature} onChange={(e) => setGroupForm({ ...groupForm, nature: e.target.value })}>
                  {natures.map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Cash/Bank Type</label>
                <select className="form-select" value={groupForm.cashBankType} onChange={(e) => setGroupForm({ ...groupForm, cashBankType: e.target.value })}>
                  {cashBankTypes.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Group</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Name</th><th>Code</th><th>Nature</th><th>Cash/Bank Type</th><th></th></tr></thead>
            <tbody>
              {groups.length === 0 ? <tr><td colSpan={5}>No account groups found.</td></tr> : groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                  <td><span className="status-pill pill-neutral">{g.nature}</span></td>
                  <td>{g.cash_bank_type}</td>
                  <td>{!g.is_system && <button className="btn btn-sm btn-danger" onClick={() => deleteGroup(g)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-journal-bookmark" /></span> Ledger Accounts</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowAccountForm((s) => !s)}><i className="bi bi-plus-lg" /> New Account</button>
        </div>

        {showAccountForm && (
          <form onSubmit={createAccount} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Group *</label>
                <select className="form-select" required value={accountForm.groupId} onChange={(e) => setAccountForm({ ...accountForm, groupId: e.target.value })}>
                  <option value="">Select group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Opening Balance (₹)</label>
                <input className="form-control" type="number" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={accountForm.openingBalanceType} onChange={(e) => setAccountForm({ ...accountForm, openingBalanceType: e.target.value })}>
                  <option value="Dr">Dr</option><option value="Cr">Cr</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">GSTIN</label>
                <input className="form-control" value={accountForm.gstin} onChange={(e) => setAccountForm({ ...accountForm, gstin: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Contact Person</label>
                <input className="form-control" value={accountForm.contactPerson} onChange={(e) => setAccountForm({ ...accountForm, contactPerson: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Phone</label>
                <input className="form-control" value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Email</label>
                <input className="form-control" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Account</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Name</th><th>Code</th><th>Group</th><th>Opening Balance</th><th></th></tr></thead>
            <tbody>
              {accounts.length === 0 ? <tr><td colSpan={5}>No ledger accounts found.</td></tr> : accounts.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/accounting/ledger/${a.id}`}>{a.name}</Link></td>
                  <td style={{ fontFamily: 'monospace' }}>{a.code}</td>
                  <td>{a.group_name}</td>
                  <td>₹{Number(a.opening_balance).toLocaleString('en-IN')} {a.opening_balance_type}</td>
                  <td>{!a.is_system && <button className="btn btn-sm btn-danger" onClick={() => deleteAccount(a)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
