import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const ANESTHESIA_TYPES = ['General Anesthesia (GA)', 'Spinal Anesthesia', 'Epidural', 'Regional Block', 'Local Anesthesia', 'Sedation'];

const EMPTY_FORM = {
  patientId: '', ipdAdmissionId: '', surgeryId: '', operationTheatreId: '', leadSurgeonId: '',
  assistantSurgeonName: '', anesthetistName: '', scrubNurseName: '', circulatingNurseName: '',
  anesthesiaType: ANESTHESIA_TYPES[0], scheduledStartTime: '', scheduledEndTime: '', priority: 'Elective', totalCost: 0,
};

export default function NewSurgeryBooking() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/surgery/masters').then((res) => setSurgeries(res.data.surgeries)).catch(() => {});
    apiClient.get('/surgery/theatres').then((res) => setTheatres(res.data.theatres)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/ipd/admissions', { params: { status: 'Admitted' } }).then((res) => setAdmissions(res.data.admissions)).catch(() => {});
  }, []);

  function selectSurgery(surgeryId) {
    const surgery = surgeries.find((s) => String(s.id) === String(surgeryId));
    setForm((f) => ({
      ...f,
      surgeryId,
      totalCost: surgery ? surgery.standard_cost : f.totalCost,
      scheduledEndTime: f.scheduledStartTime && surgery
        ? new Date(new Date(f.scheduledStartTime).getTime() + surgery.estimated_duration_minutes * 60000).toISOString().slice(0, 16)
        : f.scheduledEndTime,
    }));
  }

  function selectStart(value) {
    const surgery = surgeries.find((s) => String(s.id) === String(form.surgeryId));
    setForm((f) => ({
      ...f,
      scheduledStartTime: value,
      scheduledEndTime: value && surgery
        ? new Date(new Date(value).getTime() + surgery.estimated_duration_minutes * 60000).toISOString().slice(0, 16)
        : f.scheduledEndTime,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.patientId || !form.surgeryId || !form.operationTheatreId || !form.scheduledStartTime || !form.scheduledEndTime) {
      return setError('Patient, procedure, theatre, and schedule time are required.');
    }

    setSaving(true);
    try {
      const res = await apiClient.post('/surgery/bookings', { ...form, ipdAdmissionId: form.ipdAdmissionId || null, leadSurgeonId: form.leadSurgeonId || null });
      navigate(`/surgery/schedule/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to schedule surgery.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Schedule Surgery" />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Patient *</label>
            <select className="form-select" required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">Select patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Link IPD Admission (optional)</label>
            <select className="form-select" value={form.ipdAdmissionId} onChange={(e) => setForm({ ...form, ipdAdmissionId: e.target.value })}>
              <option value="">None</option>
              {admissions.map((a) => <option key={a.id} value={a.id}>{a.admission_number} — {a.patient_name}</option>)}
            </select>
          </div>
        </div>

        <div className="row-g">
          <div className="form-group" style={{ flex: '2 1 260px' }}>
            <label className="form-label">Procedure *</label>
            <select className="form-select" required value={form.surgeryId} onChange={(e) => selectSurgery(e.target.value)}>
              <option value="">Select procedure</option>
              {surgeries.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.estimated_duration_minutes} min)</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Priority</label>
            <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['Elective', 'Urgent', 'Emergency', 'Stat'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Operation Theatre *</label>
            <select className="form-select" required value={form.operationTheatreId} onChange={(e) => setForm({ ...form, operationTheatreId: e.target.value })}>
              <option value="">Select theatre</option>
              {theatres.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Lead Surgeon</label>
            <select className="form-select" value={form.leadSurgeonId} onChange={(e) => setForm({ ...form, leadSurgeonId: e.target.value })}>
              <option value="">None</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
        </div>

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Scheduled Start *</label>
            <input className="form-control" type="datetime-local" required value={form.scheduledStartTime} onChange={(e) => selectStart(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Scheduled End *</label>
            <input className="form-control" type="datetime-local" required value={form.scheduledEndTime} onChange={(e) => setForm({ ...form, scheduledEndTime: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Anesthesia Type</label>
            <select className="form-select" value={form.anesthesiaType} onChange={(e) => setForm({ ...form, anesthesiaType: e.target.value })}>
              {ANESTHESIA_TYPES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Assistant Surgeon</label>
            <input className="form-control" value={form.assistantSurgeonName} onChange={(e) => setForm({ ...form, assistantSurgeonName: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Anesthetist</label>
            <input className="form-control" value={form.anesthetistName} onChange={(e) => setForm({ ...form, anesthetistName: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Scrub Nurse</label>
            <input className="form-control" value={form.scrubNurseName} onChange={(e) => setForm({ ...form, scrubNurseName: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Circulating Nurse</label>
            <input className="form-control" value={form.circulatingNurseName} onChange={(e) => setForm({ ...form, circulatingNurseName: e.target.value })} />
          </div>
        </div>

        <div className="form-group" style={{ maxWidth: 220 }}>
          <label className="form-label">Total Cost (₹)</label>
          <input className="form-control" type="number" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} />
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Scheduling...' : 'Schedule Surgery'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
