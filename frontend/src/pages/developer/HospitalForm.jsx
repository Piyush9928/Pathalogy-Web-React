import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

const EMPTY = {
  name: '', code: '', address: '', city: '', state: 'Maharashtra', pincode: '', gstin: '', nablNumber: '',
  contactPerson: '', phone: '', email: '',
  superAdminName: '', superAdminEmail: '', superAdminPassword: '', planId: '', billingCycle: 'Monthly',
};

function Field({ label, name, form, setForm, errors, type = 'text', required, disabled, hint, className = '' }) {
  return (
    <div className={`form-group ${className}`}>
      <label className="form-label" htmlFor={`f-${name}`}>{label}{required && ' *'}</label>
      <input id={`f-${name}`} className="form-control" type={type} value={form[name] ?? ''} disabled={disabled}
        aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `e-${name}` : undefined}
        onChange={(e) => setForm({ ...form, [name]: name === 'code' ? e.target.value.toUpperCase() : e.target.value })} />
      {hint && !errors[name] && <small className="text-muted">{hint}</small>}
      {errors[name] && <div id={`e-${name}`} className="form-error">{errors[name]}</div>}
    </div>
  );
}

export default function HospitalForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [plans, setPlans] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (editing) {
          const res = await developerApi.get(`/developer/hospitals/${id}`);
          const h = res.data.hospital;
          setForm({
            ...EMPTY, name: h.name, code: h.code, address: h.address || '', city: h.city || '', state: h.state || '', pincode: h.pincode || '',
            gstin: h.gstin || '', nablNumber: h.nabl_number || '', contactPerson: h.contact_person || '', phone: h.phone || '', email: h.email || '',
          });
        } else {
          const res = await developerApi.get('/developer/plans');
          const active = res.data.plans.filter((p) => p.is_active);
          setPlans(active);
          const preferred = active.find((p) => p.is_popular) || active[0];
          if (preferred) setForm((f) => ({ ...f, planId: String(preferred.id) }));
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load the form.');
      }
    })();
  }, [id, editing]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setError('');
    setSubmitting(true);
    try {
      const res = editing
        ? await developerApi.put(`/developer/hospitals/${id}`, form)
        : await developerApi.post('/developer/hospitals', form);
      navigate(`/developer/hospitals/${editing ? id : res.data.id}`, { state: { flash: editing ? 'Hospital updated.' : 'Hospital onboarded. The Super Admin must change the temporary password at first sign in.' } });
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      setError(err.response?.data?.message || 'Could not save the hospital.');
    } finally {
      setSubmitting(false);
    }
  }

  const p = { form, setForm, errors };

  return (
    <>
      <PageHeader title={editing ? `Edit ${form.name || 'Hospital'}` : 'Onboard Hospital'}
        subtitle={editing ? 'Update the hospital profile' : 'Creates the tenant, its roles, a main branch and the Super Admin account'} />
      {error && <div className="auth-alert" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="lsp-panel">
          <h2 className="section-title" style={{ marginTop: 0 }}>Hospital</h2>
          <div className="form-grid">
            <Field {...p} label="Hospital name" name="name" required />
            <Field {...p} label="Tenant code" name="code" required disabled={editing} hint="Used at sign in. 3-30 letters or digits." />
            <Field {...p} label="Contact person" name="contactPerson" required />
            <Field {...p} label="Phone" name="phone" required />
            <Field {...p} label="Email" name="email" type="email" required />
            <Field {...p} label="City" name="city" required />
            <Field {...p} label="State" name="state" required />
            <Field {...p} label="Pincode" name="pincode" />
            <Field {...p} label="GSTIN" name="gstin" />
            <Field {...p} label="NABL number" name="nablNumber" />
            <Field {...p} label="Address" name="address" className="span-all" />
          </div>
        </div>

        {!editing && (
          <>
            <div className="lsp-panel" style={{ marginTop: '1rem' }}>
              <h2 className="section-title" style={{ marginTop: 0 }}>Subscription</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="f-planId">Plan *</label>
                  <select id="f-planId" className="form-control" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                    {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name} (₹{Number(pl.monthly_price).toLocaleString('en-IN')}/mo)</option>)}
                  </select>
                  {errors.planId && <div className="form-error">{errors.planId}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="f-billingCycle">Billing cycle</label>
                  <select id="f-billingCycle" className="form-control" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                    <option>Monthly</option><option>Yearly</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="lsp-panel" style={{ marginTop: '1rem' }}>
              <h2 className="section-title" style={{ marginTop: 0 }}>Super Admin</h2>
              <div className="form-grid">
                <Field {...p} label="Name" name="superAdminName" required />
                <Field {...p} label="Email" name="superAdminEmail" type="email" required />
                <Field {...p} label="Temporary password" name="superAdminPassword" type="password" required hint="At least 8 characters. They must change it at first sign in." />
              </div>
            </div>
          </>
        )}

        <div className="d-flex gap-2" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving...' : editing ? 'Save changes' : 'Onboard hospital'}</button>
          <Link className="btn btn-outline-secondary" to={editing ? `/developer/hospitals/${id}` : '/developer/hospitals'}>Cancel</Link>
        </div>
      </form>
    </>
  );
}
