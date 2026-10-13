import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', roomNumber: '', floor: '1st Floor', department: 'General Surgery', isModular: true, equipmentSummary: '' };

function statusTone(status) {
  if (status === 'In Surgery') return { bg: 'var(--lsp-danger-50)', border: 'var(--lsp-danger)', text: 'var(--lsp-danger)' };
  if (status === 'Under Fumigation') return { bg: 'var(--lsp-warning-50)', border: 'var(--lsp-warning)', text: 'var(--lsp-warning)' };
  if (status === 'Maintenance') return { bg: 'var(--lsp-surface-alt)', border: 'var(--lsp-border-strong)', text: 'var(--lsp-text-muted)' };
  return { bg: 'var(--lsp-success-50)', border: 'var(--lsp-success)', text: 'var(--lsp-success)' };
}

export default function TheatresBoard() {
  const [theatres, setTheatres] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/surgery/theatres');
      setTheatres(res.data.theatres);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load operation theatres.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/surgery/theatres', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create theatre.');
    }
  }

  async function setStatus(theatre, status) {
    try {
      await apiClient.patch(`/surgery/theatres/${theatre.id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update theatre status.');
    }
  }

  function isFumigationDue(theatre) {
    return theatre.next_fumigation_due && new Date(theatre.next_fumigation_due) <= new Date();
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-hospital" /></span> Operation Theatres</h3>
          <div className="d-flex gap-2">
            <Link className="btn btn-outline-secondary" to="/surgery/fumigation"><i className="bi bi-droplet-half" /> Log Fumigation</Link>
            <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Theatre</button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Room Number</label>
                <input className="form-control" value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Floor</label>
                <input className="form-control" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Department</label>
                <input className="form-control" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 140px' }}>
                <label className="form-label">Modular OT?</label>
                <select className="form-select" value={form.isModular ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isModular: e.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Equipment Summary</label>
              <textarea className="form-control" rows={2} placeholder="e.g. Laminar airflow, C-Arm, anesthesia workstation..." value={form.equipmentSummary} onChange={(e) => setForm({ ...form, equipmentSummary: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Theatre</button>
          </form>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.8rem' }}>
          {theatres.length === 0 ? (
            <p className="text-muted">No operation theatres found.</p>
          ) : theatres.map((t) => {
            const tone = statusTone(t.status);
            const fumigationDue = isFumigationDue(t);
            return (
              <div key={t.id} style={{ border: `1.5px solid ${tone.border}`, background: tone.bg, borderRadius: 'var(--lsp-r)', padding: '0.9rem' }}>
                <div className="d-flex justify-between align-center">
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  <span className="status-pill" style={{ color: tone.text, borderColor: tone.border }}>{t.status}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                  {t.department} · {t.floor} {t.room_number && `· Room ${t.room_number}`} {t.is_modular && '· Modular'}
                </div>
                {t.equipment_summary && <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>{t.equipment_summary}</div>}
                <div style={{ fontSize: '0.72rem', marginBottom: '0.6rem' }}>
                  {t.next_fumigation_due ? (
                    <span className={fumigationDue ? 'text-danger' : 'text-muted'}>
                      {fumigationDue ? <i className="bi bi-exclamation-triangle-fill" /> : <i className="bi bi-check2-circle" />}{' '}
                      Next fumigation due {new Date(t.next_fumigation_due).toLocaleDateString('en-IN')}
                    </span>
                  ) : <span className="text-muted">Not fumigated yet</span>}
                </div>
                <select className="form-select" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} value={t.status} onChange={(e) => setStatus(t, e.target.value)}>
                  {statuses.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
