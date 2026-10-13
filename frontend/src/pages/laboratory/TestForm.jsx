import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_FORM = {
  code: '', name: '', departmentId: '', sampleTypeId: '', containerId: '', price: 0, actualCost: 0, gstPercent: 0,
  referenceRange: '', turnaroundHours: 6, serviceCode: '', isInHouseTest: true, isVariableCharges: false,
  isListedAtPrescription: true, isCommissionable: true, commissionMode: 'Percent', fixedCommissionAmount: 0,
  commissionPercentOverride: '',
};

export default function TestForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [departments, setDepartments] = useState([]);
  const [sampleTypes, setSampleTypes] = useState([]);
  const [containers, setContainers] = useState([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/departments').then((res) => setDepartments(res.data.departments.filter((d) => d.is_active))).catch(() => {});
    apiClient.get('/sample-types').then((res) => setSampleTypes(res.data.sampleTypes.filter((s) => s.is_active))).catch(() => {});
    apiClient.get('/containers').then((res) => setContainers(res.data.containers.filter((c) => c.is_active))).catch(() => {});

    if (isEdit) {
      apiClient.get(`/tests/${id}`).then((res) => {
        const t = res.data.test;
        setForm({
          code: t.code, name: t.name, departmentId: t.department_id || '', sampleTypeId: t.sample_type_id || '',
          containerId: t.container_id || '', price: t.price, actualCost: t.actual_cost, gstPercent: t.gst_percent,
          referenceRange: t.reference_range || '', turnaroundHours: t.turnaround_hours, serviceCode: t.service_code || '',
          isInHouseTest: t.is_in_house_test, isVariableCharges: t.is_variable_charges,
          isListedAtPrescription: t.is_listed_at_prescription, isCommissionable: t.is_commissionable,
          commissionMode: t.commission_mode, fixedCommissionAmount: t.fixed_commission_amount,
          commissionPercentOverride: t.commission_percent_override || '',
        });
      }).catch((err) => setError(err.response?.data?.message || 'Failed to load test.'));
    }
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiClient.put(`/tests/${id}`, form);
        navigate('/laboratory');
      } else {
        await apiClient.post('/tests', form);
        navigate('/laboratory');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save test.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Test' : 'New Test'} />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Code *</label>
            <input className="form-control" required value={form.code} onChange={(e) => update('code', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Name *</label>
            <input className="form-control" required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Department *</label>
            <select className="form-select" required value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
              <option value="">Select</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Price (₹) *</label>
            <input className="form-control" type="number" min={0} max={100000} required value={form.price} onChange={(e) => update('price', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Sample Type *</label>
            <select className="form-select" required value={form.sampleTypeId} onChange={(e) => update('sampleTypeId', e.target.value)}>
              <option value="">Select</option>
              {sampleTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Container</label>
            <select className="form-select" value={form.containerId} onChange={(e) => update('containerId', e.target.value)}>
              <option value="">None</option>
              {containers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">TAT (hrs)</label>
            <input className="form-control" type="number" min={1} max={168} value={form.turnaroundHours} onChange={(e) => update('turnaroundHours', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Reference Range (display text)</label>
          <input className="form-control" placeholder="e.g. 13.0 - 17.0 g/dL" value={form.referenceRange} onChange={(e) => update('referenceRange', e.target.value)} />
        </div>

        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowLegacy((s) => !s)} style={{ marginBottom: '1rem' }}>
          <i className={`bi ${showLegacy ? 'bi-chevron-up' : 'bi-chevron-down'}`} /> {showLegacy ? 'Hide' : 'Show'} pricing &amp; billing options
        </button>

        {showLegacy && (
          <div style={{ background: 'var(--lsp-surface-alt)', borderRadius: 'var(--lsp-r)', padding: '1rem', marginBottom: '1rem' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Actual Cost (₹)</label>
                <input className="form-control" type="number" value={form.actualCost} onChange={(e) => update('actualCost', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">GST %</label>
                <input className="form-control" type="number" step="0.01" value={form.gstPercent} onChange={(e) => update('gstPercent', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Service Code</label>
                <input className="form-control" value={form.serviceCode} onChange={(e) => update('serviceCode', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Commission Mode</label>
                <select className="form-select" value={form.commissionMode} onChange={(e) => update('commissionMode', e.target.value)}>
                  <option>Percent</option><option>Fixed</option>
                </select>
              </div>
              {form.commissionMode === 'Fixed' ? (
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label className="form-label">Fixed Commission (₹)</label>
                  <input className="form-control" type="number" value={form.fixedCommissionAmount} onChange={(e) => update('fixedCommissionAmount', e.target.value)} />
                </div>
              ) : (
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label className="form-label">Commission % Override</label>
                  <input className="form-control" type="number" value={form.commissionPercentOverride} onChange={(e) => update('commissionPercentOverride', e.target.value)} />
                </div>
              )}
            </div>
            <div className="row-g">
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isInHouseTest} onChange={(e) => update('isInHouseTest', e.target.checked)} /> In-house test</label>
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isVariableCharges} onChange={(e) => update('isVariableCharges', e.target.checked)} /> Variable charges</label>
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isListedAtPrescription} onChange={(e) => update('isListedAtPrescription', e.target.checked)} /> Listed at prescription</label>
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isCommissionable} onChange={(e) => update('isCommissionable', e.target.checked)} /> Commissionable</label>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Test'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
