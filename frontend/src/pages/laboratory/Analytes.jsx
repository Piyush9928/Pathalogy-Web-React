import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const RESULT_TYPES = ['Numeric', 'Text', 'Dropdown', 'Boolean'];
const EMPTY_FORM = {
  analyteCode: '', analyteName: '', shortName: '', category: '', unit: '', referenceRange: '',
  criticalLow: '', criticalHigh: '', resultType: 'Numeric', predefinedValues: '', sampleType: '',
  method: '', isCommon: true, displayOrder: 0, notes: '',
};

function resultTypePill(type) {
  if (type === 'Numeric') return 'pill-teal';
  if (type === 'Dropdown') return 'pill-info';
  return 'pill-neutral';
}

export default function Analytes() {
  const [analytes, setAnalytes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/analytes', { params: { search, category: categoryFilter } });
      setAnalytes(res.data.analytes);
      setCategories(res.data.categories);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(a) {
    setForm({
      analyteCode: a.analyte_code, analyteName: a.analyte_name, shortName: a.short_name || '',
      category: a.category, unit: a.unit || '', referenceRange: a.reference_range || '',
      criticalLow: a.critical_low ?? '', criticalHigh: a.critical_high ?? '', resultType: a.result_type,
      predefinedValues: a.predefined_values || '', sampleType: a.sample_type || '', method: a.method || '',
      isCommon: a.is_common, displayOrder: a.display_order, notes: a.notes || '',
    });
    setEditingId(a.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiClient.put(`/analytes/${editingId}`, form);
      } else {
        await apiClient.post('/analytes', form);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save analyte.');
    }
  }

  async function handleDelete(a) {
    if (!window.confirm(`Delete analyte "${a.analyte_name}"?`)) return;
    try {
      await apiClient.delete(`/analytes/${a.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete analyte.');
    }
  }

  const grouped = analytes.reduce((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <div className="d-flex justify-between align-center gap-3" style={{ flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 220 }} placeholder="Search analytes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 180 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={startCreate}>
            <i className="bi bi-plus-lg" /> New Analyte
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none', marginTop: '1rem', marginBottom: 0 }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required maxLength={20} value={form.analyteCode} onChange={(e) => setForm({ ...form, analyteCode: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required maxLength={200} value={form.analyteName} onChange={(e) => setForm({ ...form, analyteName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Short Name</label>
                <input className="form-control" maxLength={50} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Category *</label>
                <input className="form-control" required list="analyte-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="analyte-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Unit</label>
                <input className="form-control" maxLength={50} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 180px' }}>
                <label className="form-label">Reference Range</label>
                <input className="form-control" maxLength={200} value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Critical Low</label>
                <input className="form-control" type="number" value={form.criticalLow} onChange={(e) => setForm({ ...form, criticalLow: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Critical High</label>
                <input className="form-control" type="number" value={form.criticalHigh} onChange={(e) => setForm({ ...form, criticalHigh: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Result Type *</label>
                <select className="form-select" value={form.resultType} onChange={(e) => setForm({ ...form, resultType: e.target.value })}>
                  {RESULT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              {form.resultType === 'Dropdown' && (
                <div className="form-group" style={{ flex: '2 1 240px' }}>
                  <label className="form-label">Predefined Values (comma-separated)</label>
                  <input className="form-control" maxLength={500} placeholder="Positive,Negative,Borderline" value={form.predefinedValues} onChange={(e) => setForm({ ...form, predefinedValues: e.target.value })} />
                </div>
              )}
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Sample Type</label>
                <input className="form-control" value={form.sampleType} onChange={(e) => setForm({ ...form, sampleType: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Method</label>
                <input className="form-control" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isCommon} onChange={(e) => setForm({ ...form, isCommon: e.target.checked })} /> Common (starred in pickers)</label>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-control" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit">Save Analyte</button>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <div className="lsp-panel">Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="lsp-panel"><div className="empty-state"><span className="es-ico"><i className="bi bi-capsule" /></span><h4>No analytes found</h4></div></div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div className="lsp-panel" key={category}>
            <h3><span className="h-ico"><i className="bi bi-tag" /></span> {category} <span className="status-pill pill-neutral" style={{ marginLeft: '0.5rem' }}>{items.length}</span></h3>
            <div className="lsp-table-wrapper">
              <table className="lsp-table">
                <thead><tr><th>Code</th><th>Analyte</th><th>Short</th><th>Unit</th><th>Reference Range</th><th>Result Type</th><th>Common</th><th></th></tr></thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td>{a.analyte_code}</td>
                      <td>{a.analyte_name} {!a.is_active && <span className="status-pill pill-neutral">Inactive</span>}</td>
                      <td>{a.short_name || '—'}</td>
                      <td>{a.unit || '—'}</td>
                      <td>{a.reference_range || '—'}</td>
                      <td><span className={`status-pill ${resultTypePill(a.result_type)}`}>{a.result_type}</span></td>
                      <td>{a.is_common && <i className="bi bi-star-fill text-warning" />}</td>
                      <td className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(a)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
