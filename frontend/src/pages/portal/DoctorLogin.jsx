import { doctorApi } from '../../api/kindClient';
import OtpLogin from './OtpLogin';

const FIELDS = [{ name: 'phone', label: 'Registered mobile number', type: 'tel', inputMode: 'tel', placeholder: '10-digit mobile' }];

export default function DoctorLogin() {
  return (
    <OtpLogin
      kind="doctor"
      api={doctorApi}
      basePath="/doctor-portal"
      homePath="/doctor-portal"
      title="Doctor Portal"
      subtitle="Sign in with your registered mobile number"
      icon="bi-person-vcard"
      fields={FIELDS}
      buildSession={(d) => ({ token: d.token, doctor: d.doctor, hospital: d.hospital })}
    />
  );
}
