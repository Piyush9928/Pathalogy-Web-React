import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../../api/kindClient';

/**
 * Two-step sign in shared by the doctor and patient portals:
 * 1) identify yourself -> a one-time code is requested, 2) enter the code.
 * `fields` describes the identifying inputs, `basePath` is e.g. '/doctor-portal'.
 */
export default function OtpLogin({ kind, api, basePath, homePath, title, subtitle, icon, fields, buildSession }) {
  const navigate = useNavigate();
  const [hospitalCode, setHospitalCode] = useState(localStorage.getItem('lsp.lastHospitalCode') || '');
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('identify');
  const [info, setInfo] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (getSession(kind)?.token) return <Navigate to={homePath} replace />;

  const payload = { hospitalCode, ...values };

  async function requestCode(e) {
    e?.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post(`${basePath}/request-otp`, payload);
      setInfo(res.data.message);
      setDevOtp(res.data.devOtp || '');
      setStep('verify');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to request a code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post(`${basePath}/login`, { ...payload, otp });
      setSession(kind, buildSession(res.data));
      navigate(homePath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div>
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon"><i className={`bi ${icon}`} /></span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {error && <div className="auth-alert" role="alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          {step === 'identify' ? (
            <form onSubmit={requestCode}>
              <div className="form-group">
                <label className="form-label" htmlFor="portal-hospital">Hospital Code</label>
                <input id="portal-hospital" className="form-control" placeholder="e.g. CITYCARE" value={hospitalCode}
                  onChange={(e) => setHospitalCode(e.target.value.toUpperCase())} required autoFocus />
              </div>
              {fields.map((f) => (
                <div className="form-group" key={f.name}>
                  <label className="form-label" htmlFor={`portal-${f.name}`}>{f.label}</label>
                  <input id={`portal-${f.name}`} className="form-control" type={f.type || 'text'} inputMode={f.inputMode}
                    placeholder={f.placeholder} value={values[f.name]}
                    onChange={(e) => setValues({ ...values, [f.name]: f.upper ? e.target.value.toUpperCase() : e.target.value })} required />
                </div>
              ))}
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send one-time code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>{info}</p>
              {devOtp && (
                <div className="otp-hint">
                  <strong>Development mode:</strong> no SMS gateway is connected, so the code is shown here: <code>{devOtp}</code>
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="portal-otp">One-time code</label>
                <input id="portal-otp" className="form-control" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting || otp.length !== 6}>
                {submitting ? 'Verifying...' : 'Sign In'}
              </button>
              <div className="auth-links">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={requestCode} disabled={submitting}>Resend code</button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setStep('identify'); setOtp(''); setError(''); }}>
                  Change details
                </button>
              </div>
            </form>
          )}

          <div className="auth-links"><Link to="/login">Hospital staff sign in</Link></div>
        </div>
        <div className="auth-footer">&copy; {new Date().getFullYear()} LabSync Pro</div>
      </div>
    </div>
  );
}
