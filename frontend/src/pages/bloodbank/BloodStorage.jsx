import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', equipmentType: 'Refrigerator', rackNumber: '', shelfNumber: '', minTemperatureC: 2, maxTemperatureC: 6, capacity: 50 };

export default function BloodStorage() {
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tempInputs, setTempInputs] = useState({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/blood-bank/storage');
      setLocations(res.data.locations);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load storage locations.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/storage', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add storage location.');
    }
  }

  async function recordTemp(loc) {
    const temperatureC = tempInputs[loc.id];
    if (temperatureC === undefined || temperatureC === '') return;
    setError('');
    try {
      const res = await apiClient.post(`/blood-bank/storage/${loc.id}/temperature`, { temperatureC });
      if (res.data.outOfRange) {
        window.alert(`Warning: recorded temperature ${temperatureC}°C is out of the safe range for ${loc.name}.`);
      }
      setTempInputs({ ...tempInputs, [loc.id]: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record temperature.');
    }
  }

  async function handleDelete(loc) {
    if (!window.confirm(`Delete storage location "${loc.name}"?`)) return;
    try {
      await apiClient.delete(`/blood-bank/storage/${loc.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-thermometer-half" /></span> Storage Locations</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Location</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Equipment Type</label>
                <select className="form-select" value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}>
                  <option>Refrigerator</option><option>Freezer</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Min °C</label>
                <input className="form-control" type="number" step="0.1" value={form.minTemperatureC} onChange={(e) => setForm({ ...form, minTemperatureC: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Max °C</label>
                <input className="form-control" type="number" step="0.1" value={form.maxTemperatureC} onChange={(e) => setForm({ ...form, maxTemperatureC: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Capacity</label>
                <input className="form-control" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Location</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Name</th><th>Type</th><th>Range</th><th>Current Temp</th><th>Last Checked</th><th>Record Temp</th><th></th></tr></thead>
            <tbody>
              {locations.length === 0 ? <tr><td colSpan={7}>No storage locations found.</td></tr> : locations.map((loc) => (
                <tr key={loc.id}>
                  <td>{loc.name}</td>
                  <td>{loc.equipment_type}</td>
                  <td>{loc.min_temperature_c}°C – {loc.max_temperature_c}°C</td>
                  <td className={loc.is_out_of_range ? 'text-danger' : ''}>{loc.current_temperature_c}°C {loc.is_out_of_range && <span className="status-pill pill-danger">Out of range</span>}</td>
                  <td>{loc.last_checked_on ? new Date(loc.last_checked_on).toLocaleString('en-IN') : '—'}</td>
                  <td>
                    <div className="d-flex gap-2">
                      <input className="form-control" type="number" step="0.1" style={{ width: 90 }} value={tempInputs[loc.id] || ''} onChange={(e) => setTempInputs({ ...tempInputs, [loc.id]: e.target.value })} />
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => recordTemp(loc)}>Log</button>
                    </div>
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(loc)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
