import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function Designations() {
  const [designations, setDesignations] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/employees/designations');
      setDesignations(res.data.designations);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load designations.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!name) return;
    try {
      await apiClient.post('/employees/designations', { name });
      setName('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create designation.');
    }
  }

  async function handleDelete(d) {
    if (!window.confirm(`Delete designation "${d.name}"?`)) return;
    try {
      await apiClient.delete(`/employees/designations/${d.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete designation.');
    }
  }

  return (
    <div className="lsp-panel">
      <h3><span className="h-ico"><i className="bi bi-diagram-2" /></span> Designation Master</h3>
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleCreate} className="row-g" style={{ marginBottom: '1rem' }}>
        <input className="form-control" style={{ flex: '1 1 220px' }} placeholder="e.g. Lab Technician" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit"><i className="bi bi-plus-lg" /> Add</button>
      </form>

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Name</th><th></th></tr></thead>
          <tbody>
            {designations.length === 0 ? <tr><td colSpan={2}>No designations found.</td></tr> : designations.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(d)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
