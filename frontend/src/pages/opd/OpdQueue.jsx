import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { patientId: '', doctorId: '', opdShift: 'Morning', opdHead: 'General OPD', consultationFee: 0 };

function statusPill(status) {
  if (status === 'Completed') return 'pill-success';
  if (status === 'In Consultation' || status === 'Calling') return 'pill-teal';
  if (status === 'Skipped' || status === 'Cancelled') return 'pill-neutral';
  return 'pill-warning';
}

export default function OpdQueue() {
  const [visits, setVisits] = useState([]);
  const [stats, setStats] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [heads, setHeads] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [vitalsFor, setVitalsFor] = useState(null);
  const [vitalsForm, setVitalsForm] = useState({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/opd/visits');
      setVisits(res.data.visits);
      setStats(res.data.stats);
      setShifts(res.data.shifts);
      setHeads(res.data.heads);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load OPD queue.');
    }
  }

  useEffect(() => {
    load();
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/opd/visits', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create OPD visit.');
    }
  }

  async function updateStatus(visit, status) {
    try {
      await apiClient.patch(`/opd/visits/${visit.id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  function openVitals(visit) {
    setVitalsFor(visit);
    setVitalsForm({ bp: visit.bp || '', pulse: visit.pulse || '', temperatureF: visit.temperature_f || '', weightKg: visit.weight_kg || '', heightCm: visit.height_cm || '', spo2: visit.spo2 || '', diagnosis: visit.diagnosis || '', consultationNotes: visit.consultation_notes || '' });
  }

  async function saveVitals(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.put(`/opd/visits/${vitalsFor.id}/consultation`, vitalsForm);
      setVitalsFor(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save consultation.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.waiting}</div><div className="kpi-label">Waiting</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.inConsultation}</div><div className="kpi-label">In Consultation</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.completed}</div><div className="kpi-label">Completed Today</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-ticket-perforated" /></span> OPD Token Queue</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Visit</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Patient *</label>
                <select className="form-select" required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                  <option value="">Select patient</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Doctor *</label>
                <select className="form-select" required value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                  <option value="">Select doctor</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Shift</label>
                <select className="form-select" value={form.opdShift} onChange={(e) => setForm({ ...form, opdShift: e.target.value })}>
                  {shifts.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">OPD Head</label>
                <select className="form-select" value={form.opdHead} onChange={(e) => setForm({ ...form, opdHead: e.target.value })}>
                  {heads.map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Consultation Fee (₹)</label>
                <input className="form-control" type="number" value={form.consultationFee} onChange={(e) => setForm({ ...form, consultationFee: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Issue Token</button>
          </form>
        )}

        {vitalsFor && (
          <form onSubmit={saveVitals} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <h4 style={{ marginTop: 0 }}>Consultation — {vitalsFor.patient_name}</h4>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 100px' }}><label className="form-label">BP</label><input className="form-control" value={vitalsForm.bp} onChange={(e) => setVitalsForm({ ...vitalsForm, bp: e.target.value })} /></div>
              <div className="form-group" style={{ flex: '1 1 90px' }}><label className="form-label">Pulse</label><input className="form-control" type="number" value={vitalsForm.pulse} onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })} /></div>
              <div className="form-group" style={{ flex: '1 1 100px' }}><label className="form-label">Temp (°F)</label><input className="form-control" type="number" step="0.1" value={vitalsForm.temperatureF} onChange={(e) => setVitalsForm({ ...vitalsForm, temperatureF: e.target.value })} /></div>
              <div className="form-group" style={{ flex: '1 1 100px' }}><label className="form-label">Weight (kg)</label><input className="form-control" type="number" step="0.1" value={vitalsForm.weightKg} onChange={(e) => setVitalsForm({ ...vitalsForm, weightKg: e.target.value })} /></div>
              <div className="form-group" style={{ flex: '1 1 100px' }}><label className="form-label">Height (cm)</label><input className="form-control" type="number" step="0.1" value={vitalsForm.heightCm} onChange={(e) => setVitalsForm({ ...vitalsForm, heightCm: e.target.value })} /></div>
              <div className="form-group" style={{ flex: '1 1 90px' }}><label className="form-label">SpO2</label><input className="form-control" type="number" value={vitalsForm.spo2} onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Diagnosis</label><input className="form-control" value={vitalsForm.diagnosis} onChange={(e) => setVitalsForm({ ...vitalsForm, diagnosis: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Consultation Notes</label><textarea className="form-control" rows={3} value={vitalsForm.consultationNotes} onChange={(e) => setVitalsForm({ ...vitalsForm, consultationNotes: e.target.value })} /></div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit">Save Consultation</button>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setVitalsFor(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Shift/Head</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {visits.length === 0 ? <tr><td colSpan={6}>No visits today.</td></tr> : visits.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>{v.token_no}</td>
                  <td>{v.patient_name} <span className="text-muted">({v.patient_uhid})</span></td>
                  <td>{v.doctor_name}</td>
                  <td>{v.opd_shift} / {v.opd_head}</td>
                  <td><span className={`status-pill ${statusPill(v.status)}`}>{v.status}</span></td>
                  <td className="d-flex gap-2">
                    <select className="form-select" style={{ width: 140 }} value={v.status} onChange={(e) => updateStatus(v, e.target.value)}>
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => openVitals(v)}>Consultation</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
