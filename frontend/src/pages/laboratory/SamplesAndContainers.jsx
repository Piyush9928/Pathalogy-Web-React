import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const CAP_COLORS = ['Plain', 'Purple', 'Red', 'Yellow', 'Green', 'Blue', 'Grey'];
const ICON_OPTIONS = ['bi-flask', 'bi-droplet-fill', 'bi-moisture', 'bi-water', 'bi-capsule', 'bi-eyedropper'];

export default function SamplesAndContainers() {
  const [sampleTypes, setSampleTypes] = useState([]);
  const [containers, setContainers] = useState([]);
  const [sampleForm, setSampleForm] = useState({ name: '', icon: ICON_OPTIONS[0], displayOrder: 0 });
  const [containerForm, setContainerForm] = useState({ name: '', capColor: 'Plain' });
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacyFields, setLegacyFields] = useState({ containerCode: '', sampleType: '', containerColorHex: '', displayOrder: 0, additive: '', sampleUses: '', remark: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const [stRes, cRes] = await Promise.all([apiClient.get('/sample-types'), apiClient.get('/containers')]);
      setSampleTypes(stRes.data.sampleTypes);
      setContainers(cRes.data.containers);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load.');
    }
  }

  useEffect(() => { load(); }, []);

  async function addSampleType(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/sample-types', sampleForm);
      setSampleForm({ name: '', icon: ICON_OPTIONS[0], displayOrder: 0 });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add sample type.');
    }
  }

  async function deleteSampleType(id) {
    if (!window.confirm('Delete this sample type?')) return;
    try {
      await apiClient.delete(`/sample-types/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete.');
    }
  }

  async function addContainer(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/containers', { ...containerForm, ...legacyFields });
      setContainerForm({ name: '', capColor: 'Plain' });
      setLegacyFields({ containerCode: '', sampleType: '', containerColorHex: '', displayOrder: 0, additive: '', sampleUses: '', remark: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add container.');
    }
  }

  async function deleteContainer(id) {
    if (!window.confirm('Delete this container?')) return;
    try {
      await apiClient.delete(`/containers/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-droplet-fill" /></span> Sample Types</h3>
          <form onSubmit={addSampleType} className="row-g" style={{ marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: '2 1 140px' }}>
              <input className="form-control" placeholder="Name" required value={sampleForm.name} onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 100px' }}>
              <select className="form-select" value={sampleForm.icon} onChange={(e) => setSampleForm({ ...sampleForm, icon: e.target.value })}>
                {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" type="submit"><i className="bi bi-plus" /></button>
          </form>
          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th></th><th>Name</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {sampleTypes.map((st) => (
                  <tr key={st.id}>
                    <td><i className={`bi ${st.icon}`} /></td>
                    <td>{st.name}</td>
                    <td><span className={`status-pill ${st.is_active ? 'pill-success' : 'pill-neutral'}`}>{st.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => deleteSampleType(st.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-thermometer-snow" /></span> Containers</h3>
          <form onSubmit={addContainer} style={{ marginBottom: '1rem' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '2 1 140px' }}>
                <input className="form-control" placeholder="Name" required value={containerForm.name} onChange={(e) => setContainerForm({ ...containerForm, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <select className="form-select" value={containerForm.capColor} onChange={(e) => setContainerForm({ ...containerForm, capColor: e.target.value })}>
                  {CAP_COLORS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" type="submit"><i className="bi bi-plus" /></button>
            </div>

            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowLegacy((s) => !s)} style={{ margin: '0.5rem 0' }}>
              {showLegacy ? 'Hide' : 'Show'} additional fields
            </button>
            {showLegacy && (
              <div className="row-g" style={{ background: 'var(--lsp-surface-alt)', padding: '0.8rem', borderRadius: 'var(--lsp-r)' }}>
                <input className="form-control" style={{ flex: '1 1 120px' }} placeholder="Container Code" value={legacyFields.containerCode} onChange={(e) => setLegacyFields({ ...legacyFields, containerCode: e.target.value })} />
                <input className="form-control" style={{ flex: '1 1 120px' }} placeholder="Sample Type tag" value={legacyFields.sampleType} onChange={(e) => setLegacyFields({ ...legacyFields, sampleType: e.target.value })} />
                <input className="form-control" type="color" style={{ flex: '0 0 60px' }} value={legacyFields.containerColorHex || '#e5e7eb'} onChange={(e) => setLegacyFields({ ...legacyFields, containerColorHex: e.target.value })} />
                <input className="form-control" style={{ flex: '1 1 120px' }} placeholder="Additive (e.g. EDTA)" value={legacyFields.additive} onChange={(e) => setLegacyFields({ ...legacyFields, additive: e.target.value })} />
                <input className="form-control" style={{ flex: '1 1 160px' }} placeholder="Sample Uses" value={legacyFields.sampleUses} onChange={(e) => setLegacyFields({ ...legacyFields, sampleUses: e.target.value })} />
                <input className="form-control" style={{ flex: '2 1 200px' }} placeholder="Remark" value={legacyFields.remark} onChange={(e) => setLegacyFields({ ...legacyFields, remark: e.target.value })} />
              </div>
            )}
          </form>

          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th></th><th>Name</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.id}>
                    <td><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: c.color_hex, border: '1px solid var(--lsp-border-strong)' }} /></td>
                    <td>{c.name}</td>
                    <td><span className={`status-pill ${c.is_active ? 'pill-success' : 'pill-neutral'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => deleteContainer(c.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
