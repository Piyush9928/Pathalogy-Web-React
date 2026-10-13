import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = {
  operationTheatreId: '', fumigationType: '', startedAt: '', completedAt: '',
  airSampleSentToMicrobiology: true, microbiologyClearanceStatus: 'Pending', performedBy: '', notes: '',
};

function clearanceTone(status) {
  if (status === 'Sterile' || status === 'Negative') return 'pill-teal';
  if (status === 'Contaminated' || status === 'Positive') return 'pill-red';
  return 'pill-amber';
}

export default function FumigationLog() {
  const [logs, setLogs] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [fumigationTypes, setFumigationTypes] = useState([]);
  const [clearanceStatuses, setClearanceStatuses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/surgery/fumigation');
      setLogs(res.data.logs);
      setFumigationTypes(res.data.fumigationTypes);
      setClearanceStatuses(res.data.clearanceStatuses);
      setForm((f) => ({ ...f, fumigationType: f.fumigationType || res.data.fumigationTypes[0] }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load fumigation logs.');
    }
  }

  useEffect(() => {
    load();
    apiClient.get('/surgery/theatres').then((res) => setTheatres(res.data.theatres)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!form.operationTheatreId || !form.startedAt || !form.completedAt) {
      return setError('Theatre, start time, and completion time are required.');
    }
    try {
      await apiClient.post('/surgery/fumigation', form);
      setForm({ ...EMPTY_FORM, fumigationType: fumigationTypes[0] });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to log fumigation.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-droplet-half" /></span> OT Fumigation Log</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> Log Fumigation</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Theatre *</label>
                <select className="form-select" required value={form.operationTheatreId} onChange={(e) => setForm({ ...form, operationTheatreId: e.target.value })}>
                  <option value="">Select theatre</option>
                  {theatres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '2 1 240px' }}>
                <label className="form-label">Fumigation Type</label>
                <select className="form-select" value={form.fumigationType} onChange={(e) => setForm({ ...form, fumigationType: e.target.value })}>
                  {fumigationTypes.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Started At *</label>
                <input className="form-control" type="datetime-local" required value={form.startedAt} onChange={(e) => setForm({ ...form, startedAt: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Completed At *</label>
                <input className="form-control" type="datetime-local" required value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Performed By</label>
                <input className="form-control" value={form.performedBy} onChange={(e) => setForm({ ...form, performedBy: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '0 0 220px' }}>
                <label className="form-label">Air Sample Sent to Microbiology?</label>
                <select className="form-select" value={form.airSampleSentToMicrobiology ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, airSampleSentToMicrobiology: e.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Microbiology Clearance Status</label>
                <select className="form-select" value={form.microbiologyClearanceStatus} onChange={(e) => setForm({ ...form, microbiologyClearanceStatus: e.target.value })}>
                  {clearanceStatuses.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Log</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Theatre</th><th>Type</th><th>Started</th><th>Completed</th><th>Air Sample</th><th>Clearance</th><th>Performed By</th></tr></thead>
            <tbody>
              {logs.length === 0 ? <tr><td colSpan={7}>No fumigation logs found.</td></tr> : logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.theatre_name}</td>
                  <td>{l.fumigation_type}</td>
                  <td>{new Date(l.started_at).toLocaleString('en-IN')}</td>
                  <td>{new Date(l.completed_at).toLocaleString('en-IN')}</td>
                  <td>{l.air_sample_sent_to_microbiology ? 'Yes' : 'No'}</td>
                  <td><span className={`status-pill ${clearanceTone(l.microbiology_clearance_status)}`}>{l.microbiology_clearance_status}</span></td>
                  <td>{l.performed_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
