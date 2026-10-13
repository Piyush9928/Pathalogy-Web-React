import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function BookingForm() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [tests, setTests] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookingTypes, setBookingTypes] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);

  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [bookingType, setBookingType] = useState('Walk In');
  const [selectedTestIds, setSelectedTestIds] = useState(new Set());
  const [selectedPackageIds, setSelectedPackageIds] = useState(new Set());
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [notes, setNotes] = useState('');

  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledSlot, setScheduledSlot] = useState('');
  const [collectionAddress, setCollectionAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [homeVisitCharge, setHomeVisitCharge] = useState(0);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/tests').then((res) => setTests(res.data.tests.filter((t) => t.is_active))).catch(() => {});
    apiClient.get('/test-packages').then((res) => setPackages(res.data.packages.filter((p) => p.is_active))).catch(() => {});
    apiClient.get('/bookings').then((res) => {
      setBookingTypes(res.data.bookingTypes);
      setPaymentModes(res.data.paymentModes);
      setTimeSlots(res.data.timeSlots);
    }).catch(() => {});
  }, []);

  const testPriceMap = useMemo(() => new Map(tests.map((t) => [t.id, Number(t.price)])), [tests]);
  const packagePriceMap = useMemo(() => new Map(packages.map((p) => [p.id, Number(p.price)])), [packages]);

  const packageTestIds = useMemo(() => {
    const map = new Map();
    packages.forEach((p) => map.set(p.id, new Set((p.resolvedTests || []).map((t) => t.id))));
    return map;
  }, [packages]);

  const subtotal = useMemo(() => {
    let total = 0;
    const coveredByPackage = new Set();
    selectedPackageIds.forEach((pkgId) => {
      total += packagePriceMap.get(pkgId) || 0;
      (packageTestIds.get(pkgId) || new Set()).forEach((tid) => coveredByPackage.add(tid));
    });
    selectedTestIds.forEach((tid) => {
      if (!coveredByPackage.has(tid)) total += testPriceMap.get(tid) || 0;
    });
    return total;
  }, [selectedPackageIds, selectedTestIds, packagePriceMap, packageTestIds, testPriceMap]);

  const balance = Math.max(subtotal - Number(paidAmount || 0), 0);

  function toggleTest(id) {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function togglePackage(id) {
    setSelectedPackageIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!patientId) return setError('Select a patient.');
    if (selectedTestIds.size === 0 && selectedPackageIds.size === 0) return setError('Select at least one test or package.');
    if (bookingType === 'Home Collection' && (!scheduledDate || !scheduledSlot || !collectionAddress)) {
      return setError('Scheduled date, time slot, and collection address are required for home collection.');
    }

    setSaving(true);
    try {
      const res = await apiClient.post('/bookings', {
        patientId, doctorId: doctorId || null, bookingType,
        testIds: [...selectedTestIds], packageIds: [...selectedPackageIds],
        paidAmount: Number(paidAmount || 0), paymentMode, notes,
        scheduledDate: scheduledDate || null, scheduledSlot: scheduledSlot || null,
        collectionAddress: collectionAddress || null, landmark: landmark || null, pincode: pincode || null,
        homeVisitCharge: Number(homeVisitCharge || 0),
      });
      // The OTP exists only in this response; hand it to the detail page so the receptionist can read it out once.
      navigate(`/bookings/${res.data.id}`, { state: res.data.otpForPatient ? { otp: res.data.otpForPatient } : undefined });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create booking.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New Booking" subtitle="A sample barcode and QR label are generated automatically once the booking is saved." />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Patient *</label>
            <select className="form-select" required value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Select patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Referring Doctor</label>
            <select className="form-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Self / Walk-in</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} ({d.specialization})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Booking Type</label>
            <select className="form-select" value={bookingType} onChange={(e) => setBookingType(e.target.value)}>
              {bookingTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {bookingType === 'Home Collection' && (
          <div style={{ background: 'var(--lsp-surface-alt)', borderRadius: 'var(--lsp-r)', padding: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}><span className="h-ico"><i className="bi bi-house-door" /></span> Home Collection Details</h3>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Scheduled Date *</label>
                <input className="form-control" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Time Slot *</label>
                <select className="form-select" value={scheduledSlot} onChange={(e) => setScheduledSlot(e.target.value)}>
                  <option value="">Select slot</option>
                  {timeSlots.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Home Visit Charge (₹)</label>
                <input className="form-control" type="number" value={homeVisitCharge} onChange={(e) => setHomeVisitCharge(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Collection Address *</label>
              <textarea className="form-control" rows={2} value={collectionAddress} onChange={(e) => setCollectionAddress(e.target.value)} />
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Landmark</label>
                <input className="form-control" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Pincode</label>
                <input className="form-control" value={pincode} onChange={(e) => setPincode(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <h3><span className="h-ico"><i className="bi bi-box2-heart" /></span> Test Packages</h3>
        <div className="row-g" style={{ marginBottom: '1rem' }}>
          {packages.length === 0 && <p className="text-muted">No packages configured.</p>}
          {packages.map((p) => (
            <label key={p.id} className="lsp-panel mb-0" style={{ flex: '1 1 220px', cursor: 'pointer', boxShadow: 'var(--lsp-e2)', padding: '0.8rem 1rem' }}>
              <div className="d-flex align-center gap-2">
                <input type="checkbox" checked={selectedPackageIds.has(p.id)} onChange={() => togglePackage(p.id)} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.name}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>{p.resolvedTests.length} tests · ₹{Number(p.price).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </label>
          ))}
        </div>

        <h3><span className="h-ico"><i className="bi bi-clipboard2-pulse" /></span> Individual Tests</h3>
        <div className="row-g" style={{ marginBottom: '1rem', maxHeight: 280, overflowY: 'auto' }}>
          {tests.map((t) => (
            <label key={t.id} className="lsp-panel mb-0" style={{ flex: '1 1 220px', cursor: 'pointer', boxShadow: 'var(--lsp-e2)', padding: '0.8rem 1rem' }}>
              <div className="d-flex align-center gap-2">
                <input type="checkbox" checked={selectedTestIds.has(t.id)} onChange={() => toggleTest(t.id)} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t.name}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>{t.department_name || '—'} · ₹{Number(t.price).toLocaleString('en-IN')} · {t.turnaround_hours}h</div>
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
          <div className="row-g">
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {paymentModes.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">Paid Amount (₹)</label>
              <input className="form-control" type="number" min={0} max={subtotal} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>
          </div>
          <div className="amount-row" style={{ fontSize: '0.95rem' }}><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
          <div className="amount-row total"><span>Balance Due</span><span className="text-danger">₹{balance.toLocaleString('en-IN')}</span></div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Booking'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
