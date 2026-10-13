import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

export default function BookingDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(''); // the page cannot render at all
  const [error, setError] = useState(''); // an action failed; the page stays usable
  // The home-collection OTP is shown once (right after the booking is created, or when it is re-issued) and is never
  // returned by the API again, so it is held in memory only.
  const [freshOtp, setFreshOtp] = useState(location.state?.otp || '');
  const [otp, setOtp] = useState('');
  const [vialBarcodes, setVialBarcodes] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/bookings/${id}`);
      setData(res.data);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load booking.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(status) {
    setError('');
    try {
      await apiClient.patch(`/bookings/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  }

  async function reissueOtp() {
    if (!window.confirm('Issue a new OTP? The previous one stops working.')) return;
    setError('');
    try {
      const res = await apiClient.post(`/bookings/${id}/reset-otp`);
      setFreshOtp(res.data.otpForPatient);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not issue a new OTP.');
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post(`/bookings/${id}/verify-otp-collect`, { otp, vialBarcodes });
      setOtp('');
      setVialBarcodes('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify OTP.');
    }
  }

  async function receiveAtLab() {
    setError('');
    try {
      await apiClient.patch(`/bookings/${id}/receive-at-lab`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  if (loadError) return <div className="auth-alert" role="alert">{loadError}</div>;
  if (!data) return <Loader />;
  const { booking, tests, statusHistory, statuses } = data;
  const isHomeCollection = booking.booking_type === 'Home Collection';

  return (
    <>
      <PageHeader
        title={booking.booking_number}
        subtitle={`${booking.patient_name} (${booking.patient_uhid})`}
        actions={<Link className="btn btn-outline-secondary" to={`/bookings/${id}/label`}><i className="bi bi-printer" /> Print Label</Link>}
      />

      {error && <div className="auth-alert" role="alert">{error}</div>}
      {freshOtp && (
        <div className="otp-hint" role="status">
          <strong>Home-collection OTP:</strong> <code>{freshOtp}</code> &mdash; give this to the patient now. It will not be shown again;
          the phlebotomist asks the patient for it at the door.
        </div>
      )}

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-signpost-split" /></span> Tracking</h3>
        <div className="d-flex gap-2" style={{ flexWrap: 'wrap' }}>
          {statuses.filter((s) => s !== 'Cancelled').map((s) => (
            <span key={s} className={`status-pill ${s === booking.status ? 'pill-teal' : 'pill-neutral'}`}>{s}</span>
          ))}
        </div>
        <div className="d-flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          {statuses.map((s) => (
            <button key={s} className={`btn btn-sm ${s === booking.status ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => updateStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-info-circle" /></span> Booking Details</h3>
          <dl className="detail-list">
            <div><dt>Type</dt><dd>{booking.booking_type}</dd></div>
            <div><dt>Referred By</dt><dd>{booking.doctor_name || 'Self'}</dd></div>
            <div><dt>Total Amount</dt><dd>₹{Number(booking.total_amount).toLocaleString('en-IN')}</dd></div>
            <div><dt>Paid</dt><dd>₹{Number(booking.paid_amount).toLocaleString('en-IN')}</dd></div>
            <div><dt>Payment Status</dt><dd><span className="status-pill pill-teal">{booking.payment_status}</span></dd></div>
            <div><dt>Payment Mode</dt><dd>{booking.payment_mode}</dd></div>
            <div><dt>Barcode</dt><dd style={{ fontFamily: 'monospace' }}>{booking.barcode_value}</dd></div>
          </dl>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-clipboard2-pulse" /></span> Tests ({tests.length})</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tests.map((t) => (
              <li key={t.id} className="d-flex justify-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--lsp-border)', fontSize: '0.85rem' }}>
                <span>{t.test_code} — {t.test_name}</span>
                <span>₹{Number(t.price_at_booking).toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isHomeCollection && (
        <div className="lsp-panel">
          <h3><span className="h-ico"><i className="bi bi-house-door" /></span> Home Collection</h3>
          <dl className="detail-list">
            <div><dt>Scheduled</dt><dd>{booking.scheduled_date ? new Date(booking.scheduled_date).toLocaleDateString('en-IN') : '—'} {booking.scheduled_slot}</dd></div>
            <div><dt>Address</dt><dd>{booking.collection_address} {booking.landmark && `(${booking.landmark})`}</dd></div>
            <div><dt>Phlebotomist</dt><dd>{booking.phlebotomist_name || 'Unassigned'}</dd></div>
            <div><dt>Dispatch Status</dt><dd>{booking.phlebotomist_status || '—'}</dd></div>
            {booking.sample_vial_barcodes && <div><dt>Vial Barcodes</dt><dd>{booking.sample_vial_barcodes}</dd></div>}
          </dl>

          {!booking.collected_at && (
            <form onSubmit={handleVerifyOtp} className="row-g" style={{ marginTop: '1rem' }}>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Verify OTP</label>
                <input className="form-control" inputMode="numeric" maxLength={4} autoComplete="one-time-code" placeholder="4-digit OTP"
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Sample Vial Barcodes</label>
                <input className="form-control" placeholder="SMP-88391, SMP-88392" value={vialBarcodes} onChange={(e) => setVialBarcodes(e.target.value)} />
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-primary" type="submit" disabled={otp.length !== 4}>Verify &amp; Collect</button>
                <button className="btn btn-outline-secondary" type="button" style={{ marginLeft: 8 }} onClick={reissueOtp}>Re-issue OTP</button>
              </div>
            </form>
          )}
          {booking.collected_at && !booking.received_at_lab_at && (
            <button className="btn btn-outline-secondary mt-2" onClick={receiveAtLab}>Mark Received at Lab</button>
          )}
        </div>
      )}

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-activity" /></span> Status History</h3>
        <ul className="activity-feed">
          {statusHistory.map((h) => (
            <li key={h.id}>
              <span className="a-dot a-info"><i className="bi bi-check2" /></span>
              <div className="a-text">{h.status} {h.changed_by && `by ${h.changed_by}`}</div>
              <div className="a-meta">{new Date(h.changed_at).toLocaleString('en-IN')}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
