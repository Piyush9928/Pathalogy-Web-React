import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const CHARGE_CATEGORIES = ['Room Rent', 'Doctor Visit', 'Nursing', 'Medicine', 'Procedure', 'Investigation', 'Other'];
const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque'];

export default function AdmissionDetail() {
  const { id } = useParams();
  const [admission, setAdmission] = useState(null);
  const [error, setError] = useState('');
  const [chargeForm, setChargeForm] = useState({ category: 'Other', description: '', quantity: 1, rate: 0 });
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMode: 'Cash', reference: '' });
  const [noteForm, setNoteForm] = useState({ notes: '', remark: '' });
  const [showDischarge, setShowDischarge] = useState(false);
  const [dischargeForm, setDischargeForm] = useState({ dischargeType: 'Normal', treatmentGiven: '', conditionAtDischarge: '', followUpInstructions: '', dischargeNotes: '', discountAmount: 0 });

  async function load() {
    try {
      const res = await apiClient.get(`/ipd/admissions/${id}`);
      setAdmission(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load admission.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addCharge(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/ipd/admissions/${id}/charges`, chargeForm);
      setChargeForm({ category: 'Other', description: '', quantity: 1, rate: 0 });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add charge.');
    }
  }

  async function removeCharge(chargeId) {
    try {
      await apiClient.delete(`/ipd/admissions/${id}/charges/${chargeId}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove charge.');
    }
  }

  async function addPayment(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/ipd/admissions/${id}/payments`, paymentForm);
      setPaymentForm({ amount: '', paymentMode: 'Cash', reference: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment.');
    }
  }

  async function addNote(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/ipd/admissions/${id}/treatment-notes`, noteForm);
      setNoteForm({ notes: '', remark: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add note.');
    }
  }

  async function handleDischarge(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/ipd/admissions/${id}/discharge`, dischargeForm);
      setShowDischarge(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to discharge patient.');
    }
  }

  if (error && !admission) return <div className="auth-alert">{error}</div>;
  if (!admission) return null;

  return (
    <>
      <PageHeader
        title={admission.admission_number}
        subtitle={`${admission.patient_name} (${admission.patient_uhid}) · ${admission.ward_name} Bed ${admission.bed_number}`}
        actions={admission.status === 'Admitted' && <button className="btn btn-danger" onClick={() => setShowDischarge((s) => !s)}>Discharge Patient</button>}
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <dl className="detail-list">
          <div><dt>Status</dt><dd><span className={`status-pill ${admission.status === 'Admitted' ? 'pill-teal' : 'pill-neutral'}`}>{admission.status}</span></dd></div>
          <div><dt>Attending Doctor</dt><dd>{admission.doctor_name || '—'}</dd></div>
          <div><dt>Diagnosis</dt><dd>{admission.diagnosis || '—'}</dd></div>
          <div><dt>Length of Stay</dt><dd>{admission.lengthOfStayDays} day(s)</dd></div>
          <div><dt>Grand Total</dt><dd>₹{admission.grandTotal.toLocaleString('en-IN')}</dd></div>
          <div><dt>Paid</dt><dd>₹{admission.paidAmount.toLocaleString('en-IN')}</dd></div>
          <div><dt>Balance Due</dt><dd className="text-danger">₹{admission.balanceDue.toLocaleString('en-IN')}</dd></div>
        </dl>
      </div>

      {showDischarge && (
        <form onSubmit={handleDischarge} className="lsp-panel">
          <h3><span className="h-ico"><i className="bi bi-file-earmark-check" /></span> Discharge Summary</h3>
          <div className="row-g">
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Discharge Type</label>
              <select className="form-select" value={dischargeForm.dischargeType} onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeType: e.target.value })}>
                {['Normal', 'DAMA', 'LAMA', 'Death', 'Transfer'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label className="form-label">Discount (₹)</label>
              <input className="form-control" type="number" value={dischargeForm.discountAmount} onChange={(e) => setDischargeForm({ ...dischargeForm, discountAmount: e.target.value })} />
            </div>
          </div>
          <div className="form-group"><label className="form-label">Treatment Given</label><textarea className="form-control" rows={3} value={dischargeForm.treatmentGiven} onChange={(e) => setDischargeForm({ ...dischargeForm, treatmentGiven: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Condition at Discharge</label><input className="form-control" value={dischargeForm.conditionAtDischarge} onChange={(e) => setDischargeForm({ ...dischargeForm, conditionAtDischarge: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Follow-up Instructions</label><textarea className="form-control" rows={2} value={dischargeForm.followUpInstructions} onChange={(e) => setDischargeForm({ ...dischargeForm, followUpInstructions: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Additional Notes</label><textarea className="form-control" rows={2} value={dischargeForm.dischargeNotes} onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeNotes: e.target.value })} /></div>
          <button className="btn btn-danger" type="submit">Confirm Discharge</button>
        </form>
      )}

      {admission.status === 'Discharged' && (
        <div className="lsp-panel">
          <h3><span className="h-ico"><i className="bi bi-file-earmark-check" /></span> Discharge Summary ({admission.discharge_type})</h3>
          <dl className="detail-list">
            <div><dt>Treatment Given</dt><dd>{admission.treatment_given || '—'}</dd></div>
            <div><dt>Condition at Discharge</dt><dd>{admission.condition_at_discharge || '—'}</dd></div>
            <div><dt>Follow-up Instructions</dt><dd>{admission.follow_up_instructions || '—'}</dd></div>
          </dl>
        </div>
      )}

      <div className="dash-row" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-receipt" /></span> Charges</h3>
          <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
            <table className="lsp-table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {admission.charges.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.charge_date).toLocaleDateString('en-IN')}</td>
                    <td>{c.category}</td>
                    <td>{c.description}</td>
                    <td>{c.quantity}</td>
                    <td>₹{Number(c.rate).toLocaleString('en-IN')}</td>
                    <td>₹{c.amount.toLocaleString('en-IN')}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeCharge(c.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admission.status === 'Admitted' && (
            <form onSubmit={addCharge} className="row-g">
              <select className="form-select" style={{ flex: '1 1 140px' }} value={chargeForm.category} onChange={(e) => setChargeForm({ ...chargeForm, category: e.target.value })}>
                {CHARGE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="form-control" style={{ flex: '2 1 180px' }} placeholder="Description" value={chargeForm.description} onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })} />
              <input className="form-control" type="number" style={{ flex: '1 1 80px' }} placeholder="Qty" value={chargeForm.quantity} onChange={(e) => setChargeForm({ ...chargeForm, quantity: e.target.value })} />
              <input className="form-control" type="number" style={{ flex: '1 1 100px' }} placeholder="Rate" value={chargeForm.rate} onChange={(e) => setChargeForm({ ...chargeForm, rate: e.target.value })} />
              <button className="btn btn-primary" type="submit">Add</button>
            </form>
          )}
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-cash-stack" /></span> Payments</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: '1rem' }}>
            {admission.payments.map((p) => (
              <li key={p.id} className="d-flex justify-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--lsp-border)', fontSize: '0.85rem' }}>
                <span>{p.payment_mode}</span><span>₹{Number(p.amount).toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
          {admission.status === 'Admitted' && (
            <form onSubmit={addPayment} className="row-g">
              <input className="form-control" type="number" style={{ flex: '1 1 100px' }} placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              <select className="form-select" style={{ flex: '1 1 120px' }} value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}>
                {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <button className="btn btn-primary" type="submit">Add</button>
            </form>
          )}
        </div>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-journal-text" /></span> Daily Treatment Notes</h3>
        <ul className="activity-feed">
          {admission.treatmentNotes.map((n) => (
            <li key={n.id}><span className="a-dot a-info"><i className="bi bi-pencil" /></span><div className="a-text">{n.notes}</div><div className="a-meta">{n.doctor_name} · {new Date(n.note_date).toLocaleDateString('en-IN')}</div></li>
          ))}
        </ul>
        {admission.status === 'Admitted' && (
          <form onSubmit={addNote} className="row-g mt-2">
            <textarea className="form-control" style={{ flex: '3 1 300px' }} rows={1} placeholder="Progress note..." value={noteForm.notes} onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })} />
            <button className="btn btn-primary" type="submit">Add Note</button>
          </form>
        )}
      </div>
    </>
  );
}
