import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

import HospitalBrand from '../../components/HospitalBrand';
export default function BookingLabel() {
  const { id } = useParams();
  const { hospital } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const qrRef = useRef(null);

  useEffect(() => {
    apiClient.get(`/bookings/${id}`).then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Failed to load booking.'));
  }, [id]);

  useEffect(() => {
    if (data && qrRef.current) {
      const { booking } = data;
      QRCode.toCanvas(qrRef.current, `${booking.barcode_value} | ${booking.patient_uhid}`, { width: 120, margin: 0 });
      setTimeout(() => window.print(), 350);
    }
  }, [data]);

  if (error) return <div className="auth-alert">{error}</div>;
  if (!data) return null;

  const { booking, tests } = data;

  return (
    <div style={{ maxWidth: 380, margin: '2rem auto', padding: '1.5rem', border: '1px solid #000', fontFamily: 'monospace' }}>
      <HospitalBrand hospital={hospital} size={32} nameStyle={{ fontSize: '1rem' }} style={{ justifyContent: 'center', marginBottom: '0.3rem' }} />
      <div style={{ textAlign: 'center', fontSize: '0.75rem', marginBottom: '1rem' }}>Sample Collection Label</div>
      <hr />
      <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
        <div><strong>Patient:</strong> {booking.patient_name}</div>
        <div><strong>UHID:</strong> {booking.patient_uhid}</div>
        <div><strong>Booking:</strong> {booking.booking_number}</div>
        <div><strong>Date:</strong> {new Date(booking.booking_date).toLocaleString('en-IN')}</div>
        <div><strong>Tests:</strong> {tests.map((t) => t.test_name).join(', ')}</div>
      </div>
      <hr />
      <div style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '2px', margin: '0.6rem 0' }}>{booking.barcode_value}</div>
      <div style={{ textAlign: 'center', height: 30, background: 'repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 5px)', margin: '0 auto 1rem', width: '90%' }} />
      <div style={{ textAlign: 'center' }}>
        <canvas ref={qrRef} />
      </div>
    </div>
  );
}
