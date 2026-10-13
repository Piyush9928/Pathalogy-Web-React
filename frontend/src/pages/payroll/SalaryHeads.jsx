import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', code: '', type: 'Earning', calculationType: 'Fixed', amount: 0, percent: 0, basicSalaryLimit: '', isApplicableOnOverLimit: true, displayOrder: 0 };

export default function SalaryHeads() {
  const [heads, setHeads] = useState([]);
  const [headTypes, setHeadTypes] = useState([]);
  const [calculationTypes, setCalculationTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/payroll/salary-heads');
      setHeads(res.data.salaryHeads);
      setHeadTypes(res.data.headTypes);
      setCalculationTypes(res.data.calculationTypes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load salary heads.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/payroll/salary-heads', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create salary head.');
    }
  }

  async function handleDelete(h) {
    if (!window.confirm(`Delete salary head "${h.name}"?`)) return;
    try {
      await apiClient.delete(`/payroll/salary-heads/${h.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete salary head.');
    }
  }

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-list-columns" /></span> Salary Heads</h3>
        <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Salary Head</button>
      </div>
      {error && <div className="auth-alert">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
          <div className="row-g">
            <div className="form-group" style={{ flex: '2 1 200px' }}>
              <label className="form-label">Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label className="form-label">Code *</label>
              <input className="form-control" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {headTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Calculation</label>
              <select className="form-select" value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value })}>
                {calculationTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="row-g">
            {form.calculationType === 'Fixed' ? (
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Amount (₹)</label>
                <input className="form-control" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            ) : (
              <>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Percent of Basic</label>
                  <input className="form-control" type="number" step="0.01" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: '1 1 180px' }}>
                  <label className="form-label">Basic Salary Cap (optional, PF-style)</label>
                  <input className="form-control" type="number" value={form.basicSalaryLimit} onChange={(e) => setForm({ ...form, basicSalaryLimit: e.target.value })} />
                </div>
              </>
            )}
            <div className="form-group" style={{ flex: '1 1 120px' }}>
              <label className="form-label">Display Order</label>
              <input className="form-control" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit">Save Salary Head</button>
        </form>
      )}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Calculation</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {heads.length === 0 ? <tr><td colSpan={6}>No salary heads found.</td></tr> : heads.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td style={{ fontFamily: 'monospace' }}>{h.code}</td>
                <td><span className={`status-pill ${h.type === 'Earning' ? 'pill-teal' : 'pill-danger'}`}>{h.type}</span></td>
                <td>{h.calculation_type}</td>
                <td>{h.calculation_type === 'Fixed' ? `₹${Number(h.amount).toLocaleString('en-IN')}` : `${h.percent}%${h.basic_salary_limit ? ` (cap ₹${Number(h.basic_salary_limit).toLocaleString('en-IN')})` : ''}`}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(h)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
