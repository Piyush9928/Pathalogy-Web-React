import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const TABS = [
  { key: 'patients', label: 'Patients', idKey: 'patientId', nameField: 'full_name' },
  { key: 'doctors', label: 'Doctors', idKey: 'doctorId', nameField: 'full_name' },
  { key: 'suppliers', label: 'Suppliers', idKey: 'supplierId', nameField: 'name' },
  { key: 'accounts', label: 'Ledger Accounts', idKey: 'ledgerAccountId', nameField: 'name' },
];

export default function OpeningBalances() {
  const [financialYears, setFinancialYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [activeTab, setActiveTab] = useState('patients');
  const [balances, setBalances] = useState([]);
  const [options, setOptions] = useState([]);
  const [form, setForm] = useState({ entityId: '', amount: '', balanceType: 'Dr' });
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/opening-balances/financial-years').then((res) => {
      setFinancialYears(res.data.financialYears);
      const current = res.data.financialYears.find((f) => f.is_current);
      setFinancialYearId(current?.id || res.data.financialYears[0]?.id || '');
    }).catch((err) => setError(err.response?.data?.message || 'Failed to load financial years.'));
  }, []);

  async function loadBalances() {
    if (!financialYearId) return;
    try {
      const res = await apiClient.get(`/opening-balances/${activeTab}`, { params: { financialYearId } });
      setBalances(res.data.balances);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load opening balances.');
    }
  }

  useEffect(() => { loadBalances(); }, [activeTab, financialYearId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const endpoints = { patients: '/patients', doctors: '/doctors', suppliers: '/suppliers', accounts: '/accounting/accounts' };
    const dataKeys = { patients: 'patients', doctors: 'doctors', suppliers: 'suppliers', accounts: 'accounts' };
    apiClient.get(endpoints[activeTab], { params: { pageSize: 200 } }).then((res) => setOptions(res.data[dataKeys[activeTab]] || [])).catch(() => setOptions([]));
  }, [activeTab]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const tab = TABS.find((t) => t.key === activeTab);
    if (!form.entityId || !form.amount) return setError('Select an entity and enter an amount.');
    try {
      await apiClient.post(`/opening-balances/${activeTab}`, { financialYearId, [tab.idKey]: form.entityId, amount: form.amount, balanceType: form.balanceType });
      setForm({ entityId: '', amount: '', balanceType: 'Dr' });
      await loadBalances();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save opening balance.');
    }
  }

  async function handleDelete(b) {
    if (!window.confirm('Delete this opening balance entry?')) return;
    try {
      await apiClient.delete(`/opening-balances/${activeTab}/${b.id}`);
      await loadBalances();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete opening balance.');
    }
  }

  const tab = TABS.find((t) => t.key === activeTab);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Opening Balances</h1>
          <p className="page-subtitle">Per financial year, for patients, doctors, suppliers, and ledger accounts.</p>
        </div>
      </div>

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ padding: '0.6rem', marginBottom: '1rem' }}>
        <div className="d-flex justify-between align-center" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button key={t.key} className={`btn btn-sm ${activeTab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ borderRadius: '999px' }} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <select className="form-select" style={{ maxWidth: 200 }} value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)}>
            {financialYears.map((fy) => <option key={fy.id} value={fy.id}>FY {fy.fin_year}{fy.is_current ? ' (Current)' : ''}</option>)}
          </select>
        </div>
      </div>

      <div className="lsp-panel">
        <form onSubmit={handleCreate} className="row-g" style={{ marginBottom: '1rem' }}>
          <select className="form-select" style={{ flex: '2 1 220px' }} value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
            <option value="">Select {tab.label.toLowerCase().slice(0, -1)}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o[tab.nameField]}</option>)}
          </select>
          <input className="form-control" style={{ flex: '1 1 140px' }} type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="form-select" style={{ flex: '0 0 100px' }} value={form.balanceType} onChange={(e) => setForm({ ...form, balanceType: e.target.value })}>
            <option value="Dr">Dr</option><option value="Cr">Cr</option>
          </select>
          <button className="btn btn-primary" type="submit">Save</button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>{tab.label.slice(0, -1)}</th><th>Amount</th><th>Type</th><th></th></tr></thead>
            <tbody>
              {balances.length === 0 ? <tr><td colSpan={4}>No opening balances found.</td></tr> : balances.map((b) => (
                <tr key={b.id}>
                  <td>{b.full_name || b.name}</td>
                  <td>₹{Number(b.amount).toLocaleString('en-IN')}</td>
                  <td><span className="status-pill pill-neutral">{b.balance_type}</span></td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(b)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
