import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_COMPANY_FORM = { name: '', code: '', gstin: '', address: '', phone: '', email: '' };
const EMPTY_YEAR_FORM = { finYear: '', fromDate: '', toDate: '' };

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY_FORM);
  const [yearForms, setYearForms] = useState({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/companies');
      setCompanies(res.data.companies);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load companies.');
    }
  }

  useEffect(() => { load(); }, []);

  async function createCompany(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/companies', companyForm);
      setCompanyForm(EMPTY_COMPANY_FORM);
      setShowCompanyForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create company.');
    }
  }

  async function setDefault(company) {
    try {
      await apiClient.patch(`/companies/${company.id}/set-default`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set default company.');
    }
  }

  async function createYear(companyId) {
    setError('');
    const form = yearForms[companyId] || EMPTY_YEAR_FORM;
    if (!form.finYear || !form.fromDate || !form.toDate) return setError('Financial year label, from date, and to date are required.');
    try {
      await apiClient.post(`/companies/${companyId}/financial-years`, form);
      setYearForms((f) => ({ ...f, [companyId]: EMPTY_YEAR_FORM }));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create financial year.');
    }
  }

  async function setCurrentYear(yearId) {
    try {
      await apiClient.patch(`/companies/financial-years/${yearId}/set-current`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set current financial year.');
    }
  }

  async function toggleLock(year) {
    const action = year.is_locked ? 'unlock' : 'lock';
    if (!window.confirm(`${action === 'lock' ? 'Lock' : 'Unlock'} FY ${year.fin_year}? ${action === 'lock' ? 'No further postings will be allowed until unlocked.' : ''}`)) return;
    try {
      await apiClient.patch(`/companies/financial-years/${year.id}/lock`, { isLocked: !year.is_locked });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} financial year.`);
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-building-gear" /></span> Companies</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowCompanyForm((s) => !s)}><i className="bi bi-plus-lg" /> New Company</button>
        </div>

        {showCompanyForm && (
          <form onSubmit={createCompany} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">GSTIN</label>
                <input className="form-control" value={companyForm.gstin} onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-control" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Company</button>
          </form>
        )}

        {companies.map((c) => (
          <div key={c.id} className="lsp-panel" style={{ border: '1px solid var(--lsp-border)' }}>
            <div className="d-flex justify-between align-center" style={{ marginBottom: '0.6rem' }}>
              <div>
                <strong>{c.name}</strong> <span className="text-muted">({c.code})</span>
                {c.is_default && <span className="status-pill pill-teal" style={{ marginLeft: '0.5rem' }}>Default</span>}
              </div>
              {!c.is_default && <button className="btn btn-sm btn-outline-secondary" onClick={() => setDefault(c)}>Set as Default</button>}
            </div>
            <div className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.6rem' }}>
              {c.gstin && `GSTIN: ${c.gstin} · `}{c.address} · Branches: {c.branches.map((b) => b.name).join(', ') || 'none assigned'}
            </div>

            <h4>Financial Years</h4>
            <div className="lsp-table-wrapper" style={{ marginBottom: '0.8rem' }}>
              <table className="lsp-table">
                <thead><tr><th>FY</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {c.financialYears.length === 0 ? <tr><td colSpan={5}>No financial years yet.</td></tr> : c.financialYears.map((fy) => (
                    <tr key={fy.id}>
                      <td>{fy.fin_year}</td>
                      <td>{new Date(fy.from_date).toLocaleDateString('en-IN')}</td>
                      <td>{new Date(fy.to_date).toLocaleDateString('en-IN')}</td>
                      <td>
                        {fy.is_current && <span className="status-pill pill-teal">Current</span>}{' '}
                        {fy.is_locked && <span className="status-pill pill-danger">Locked</span>}
                      </td>
                      <td className="d-flex gap-2">
                        {!fy.is_current && <button className="btn btn-sm btn-outline-secondary" onClick={() => setCurrentYear(fy.id)}>Set Current</button>}
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleLock(fy)}>{fy.is_locked ? 'Unlock' : 'Lock'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); createYear(c.id); }} className="row-g">
              <input className="form-control" style={{ flex: '1 1 100px' }} placeholder="e.g. 25-26" value={yearForms[c.id]?.finYear || ''} onChange={(e) => setYearForms((f) => ({ ...f, [c.id]: { ...(f[c.id] || EMPTY_YEAR_FORM), finYear: e.target.value } }))} />
              <input className="form-control" style={{ flex: '1 1 140px' }} type="date" value={yearForms[c.id]?.fromDate || ''} onChange={(e) => setYearForms((f) => ({ ...f, [c.id]: { ...(f[c.id] || EMPTY_YEAR_FORM), fromDate: e.target.value } }))} />
              <input className="form-control" style={{ flex: '1 1 140px' }} type="date" value={yearForms[c.id]?.toDate || ''} onChange={(e) => setYearForms((f) => ({ ...f, [c.id]: { ...(f[c.id] || EMPTY_YEAR_FORM), toDate: e.target.value } }))} />
              <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-plus-lg" /> Add Financial Year</button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
