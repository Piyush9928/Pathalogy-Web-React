import { patientApi } from '../../api/kindClient';
import OtpLogin from './OtpLogin';

const FIELDS = [
  { name: 'uhid', label: 'UHID', placeholder: 'e.g. UHID-2026-000001', upper: true },
  { name: 'phone', label: 'Registered mobile number', type: 'tel', inputMode: 'tel', placeholder: '10-digit mobile' },
];

export default function PatientLogin() {
  return (
    <OtpLogin
      kind="patient"
      api={patientApi}
      basePath="/patient-portal"
      homePath="/patient-portal"
      title="Patient Portal"
      subtitle="Sign in to view your reports and invoices"
      icon="bi-heart-pulse"
      fields={FIELDS}
      buildSession={(d) => ({ token: d.token, patient: d.patient, hospital: d.hospital })}
    />
  );
}
