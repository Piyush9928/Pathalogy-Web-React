import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

const STATUS_FLOW = ['Scheduled', 'Pre-Op Holding', 'In Surgery', 'PACU / Recovery', 'Completed'];

function statusPillClass(status) {
  if (status === 'Completed') return 'pill-teal';
  if (status === 'In Surgery') return 'pill-red';
  if (status === 'Cancelled' || status === 'Postponed') return 'pill-neutral';
  return 'pill-amber';
}

export default function CaseSheetDetail() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [checklist, setChecklist] = useState(null);
  const [tests, setTests] = useState([]);
  const [specimenForm, setSpecimenForm] = useState({ testId: '', specimenDescription: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get(`/surgery/bookings/${id}`);
      setBooking(res.data);
      setChecklist({
        preOpNpoConfirmed: res.data.pre_op_npo_confirmed,
        preOpConsentSigned: res.data.pre_op_consent_signed,
        preOpBloodArranged: res.data.pre_op_blood_arranged,
        preOpPacCleared: res.data.pre_op_pac_cleared,
        preOpDiagnosis: res.data.pre_op_diagnosis || '',
        postOpDiagnosis: res.data.post_op_diagnosis || '',
        implantDetails: res.data.implant_details || '',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load case sheet.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.get('/tests').then((res) => setTests(res.data.tests)).catch(() => {});
  }, []);

  async function changeStatus(status) {
    setError('');
    setBusy(true);
    try {
      await apiClient.patch(`/surgery/bookings/${id}/status`, { status, appendNote: noteText || undefined });
      setNoteText('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCaseSheet(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiClient.put(`/surgery/bookings/${id}/case-sheet`, checklist);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save case sheet.');
    } finally {
      setBusy(false);
    }
  }

  async function sendSpecimen(e) {
    e.preventDefault();
    setError('');
    if (!specimenForm.testId) return setError('Select the histopathology/biopsy test to dispatch.');
    setBusy(true);
    try {
      await apiClient.post(`/surgery/bookings/${id}/send-specimen`, specimenForm);
      setSpecimenForm({ testId: '', specimenDescription: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to dispatch specimen.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !booking) return <div className="auth-alert">{error}</div>;
  if (!booking) return <Loader />;
  const currentIdx = STATUS_FLOW.indexOf(booking.status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;
  const isTerminal = booking.status === 'Completed' || booking.status === 'Cancelled';

  return (
    <>
      <PageHeader
        title={booking.case_number}
        subtitle={`${booking.patient_name} (${booking.patient_uhid}) · ${booking.surgery_name} · ${booking.theatre_name}`}
        actions={<span className={`status-pill ${statusPillClass(booking.status)}`} style={{ fontSize: '0.85rem' }}>{booking.status}</span>}
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <dl className="detail-list">
          <div><dt>Patient</dt><dd>{booking.patient_name} ({booking.gender}, {booking.age}y)</dd></div>
          <div><dt>Procedure</dt><dd>{booking.surgery_name} — {booking.department}</dd></div>
          <div><dt>Theatre</dt><dd>{booking.theatre_name}</dd></div>
          <div><dt>Lead Surgeon</dt><dd>{booking.lead_surgeon_name || '—'}</dd></div>
          <div><dt>Assistant Surgeon</dt><dd>{booking.assistant_surgeon_name || '—'}</dd></div>
          <div><dt>Anesthetist</dt><dd>{booking.anesthetist_name || '—'} ({booking.anesthesia_type})</dd></div>
          <div><dt>Scrub / Circulating Nurse</dt><dd>{booking.scrub_nurse_name || '—'} / {booking.circulating_nurse_name || '—'}</dd></div>
          <div><dt>Priority</dt><dd><span className="status-pill pill-neutral">{booking.priority}</span></dd></div>
          <div><dt>Scheduled</dt><dd>{new Date(booking.scheduled_start_time).toLocaleString('en-IN')} → {new Date(booking.scheduled_end_time).toLocaleString('en-IN')}</dd></div>
          {booking.actual_start_time && <div><dt>Actual Start</dt><dd>{new Date(booking.actual_start_time).toLocaleString('en-IN')}</dd></div>}
          {booking.actual_end_time && <div><dt>Actual End</dt><dd>{new Date(booking.actual_end_time).toLocaleString('en-IN')}</dd></div>}
          {booking.admission_number && <div><dt>Linked IPD Admission</dt><dd>{booking.admission_number}</dd></div>}
          <div><dt>Total Cost</dt><dd>₹{Number(booking.total_cost).toLocaleString('en-IN')}</dd></div>
        </dl>
      </div>

      {!isTerminal && (
        <div className="lsp-panel">
          <h3><span className="h-ico"><i className="bi bi-arrow-right-circle" /></span> Case Progress</h3>
          <div className="d-flex gap-2" style={{ flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            {STATUS_FLOW.map((s, idx) => (
              <span key={s} className={`status-pill ${idx <= currentIdx ? 'pill-teal' : 'pill-neutral'}`}>{idx + 1}. {s}</span>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">Add a note (optional, will be appended to surgical notes)</label>
            <textarea className="form-control" rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </div>
          <div className="d-flex gap-2">
            {nextStatus && (
              <button className="btn btn-primary" disabled={busy} onClick={() => changeStatus(nextStatus)}>
                Move to "{nextStatus}"
              </button>
            )}
            <button className="btn btn-outline-secondary" disabled={busy} onClick={() => changeStatus('Postponed')}>Postpone</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => changeStatus('Cancelled')}>Cancel Surgery</button>
          </div>
        </div>
      )}

      <form onSubmit={saveCaseSheet} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-clipboard2-pulse" /></span> Pre-Op Checklist &amp; Diagnoses</h3>
        <div className="row-g" style={{ marginBottom: '0.8rem' }}>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={checklist.preOpNpoConfirmed} onChange={(e) => setChecklist({ ...checklist, preOpNpoConfirmed: e.target.checked })} /> NPO Confirmed</label>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={checklist.preOpConsentSigned} onChange={(e) => setChecklist({ ...checklist, preOpConsentSigned: e.target.checked })} /> Consent Signed</label>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={checklist.preOpBloodArranged} onChange={(e) => setChecklist({ ...checklist, preOpBloodArranged: e.target.checked })} /> Blood Arranged</label>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={checklist.preOpPacCleared} onChange={(e) => setChecklist({ ...checklist, preOpPacCleared: e.target.checked })} /> PAC Cleared</label>
        </div>
        <div className="form-group">
          <label className="form-label">Pre-Op Diagnosis</label>
          <textarea className="form-control" rows={2} value={checklist.preOpDiagnosis} onChange={(e) => setChecklist({ ...checklist, preOpDiagnosis: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Post-Op Diagnosis</label>
          <textarea className="form-control" rows={2} value={checklist.postOpDiagnosis} onChange={(e) => setChecklist({ ...checklist, postOpDiagnosis: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Implant Details</label>
          <textarea className="form-control" rows={2} value={checklist.implantDetails} onChange={(e) => setChecklist({ ...checklist, implantDetails: e.target.value })} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>Save Case Sheet</button>
      </form>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-send" /></span> Biopsy / Specimen Dispatch to Pathology</h3>
        {booking.specimen_sent_to_pathology ? (
          <div>
            <p><i className="bi bi-check2-circle text-success" /> Specimen dispatched. {booking.specimen_description && <>Description: {booking.specimen_description}.</>}</p>
            {booking.specimen_booking_id && (
              <Link className="btn btn-sm btn-outline-secondary" to={`/bookings/${booking.specimen_booking_id}`}>View Lab Booking</Link>
            )}
          </div>
        ) : (
          <form onSubmit={sendSpecimen} className="row-g">
            <div className="form-group" style={{ flex: '2 1 240px' }}>
              <label className="form-label">Histopathology / Biopsy Test *</label>
              <select className="form-select" value={specimenForm.testId} onChange={(e) => setSpecimenForm({ ...specimenForm, testId: e.target.value })}>
                <option value="">Select test</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '3 1 260px' }}>
              <label className="form-label">Specimen Description</label>
              <input className="form-control" placeholder="e.g. Excised lymph node, left axilla" value={specimenForm.specimenDescription} onChange={(e) => setSpecimenForm({ ...specimenForm, specimenDescription: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>Dispatch to Lab</button>
            </div>
          </form>
        )}
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-journal-text" /></span> Surgical Notes</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.85rem', margin: 0 }}>{booking.surgical_notes || 'No notes yet.'}</pre>
      </div>
    </>
  );
}
