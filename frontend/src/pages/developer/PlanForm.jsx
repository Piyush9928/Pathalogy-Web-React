import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

const EMPTY = {
  name: '', code: '', tagline: '', monthlyPrice: 4999, yearlyPrice: 49990, maxUsers: 10, maxBranches: 1, maxTestsPerMonth: 2000,
  featuresText: 'Patient registration & UHID\nTest master & bookings\nReport generation (PDF)\nBilling with GST', isPopular: false, isActive: true,
};

const NUMBER_FIELDS = [
  ['monthlyPrice', 'Monthly price (₹)'], ['yearlyPrice', 'Yearly price (₹)'], ['maxUsers', 'Max users'],
  ['maxBranches', 'Max branches'], ['maxTestsPerMonth', 'Max tests per month'],
];

export default function PlanForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    developerApi.get('/developer/plans').then((res) => {
      const p = res.data.plans.find((x) => String(x.id) === String(id));
      if (!p) { setError('Plan not found.'); return; }
      setForm({
        name: p.name, code: p.code, tagline: p.tagline || '', monthlyPrice: p.monthly_price, yearlyPrice: p.yearly_price, maxUsers: p.max_users,
        maxBranches: p.max_branches, maxTestsPerMonth: p.max_tests_per_month, featuresText: p.features.join('\n'), isPopular: p.is_popular, isActive: p.is_active,
      });
    }).catch((err) => setError(err.response?.data?.message || 'Failed to load the plan.'));
  }, [id, editing]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setError('');
    setSubmitting(true);
    try {
      if (editing) await developerApi.put(`/developer/plans/${id}`, form);
      else await developerApi.post('/developer/plans', form);
      navigate('/developer/plans');
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      setError(err.response?.data?.message || 'Could not save the plan.');
    } finally {
      setSubmitting(false);
    }
  }

  const text = (name, label, extra = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`p-${name}`}>{label}</label>
      <input id={`p-${name}`} className="form-control" value={form[name]} aria-invalid={!!errors[name]}
        onChange={(e) => setForm({ ...form, [name]: extra.upper ? e.target.value.toUpperCase() : e.target.value })} />
      {errors[name] && <div className="form-error">{errors[name]}</div>}
    </div>
  );

  return (
    <>
      <PageHeader title={editing ? `Edit ${form.name || 'Plan'}` : 'New Plan'} />
      {error && <div className="auth-alert" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} noValidate className="lsp-panel">
        <div className="form-grid">
          {text('name', 'Plan name')}
          {text('code', 'Code', { upper: true })}
          {text('tagline', 'Tagline')}
          {NUMBER_FIELDS.map(([name, label]) => (
            <div className="form-group" key={name}>
              <label className="form-label" htmlFor={`p-${name}`}>{label}</label>
              <input id={`p-${name}`} className="form-control" type="number" min="0" value={form[name]} aria-invalid={!!errors[name]}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
              {errors[name] && <div className="form-error">{errors[name]}</div>}
            </div>
          ))}
          <div className="form-group span-all">
            <label className="form-label" htmlFor="p-features">Features (one per line)</label>
            <textarea id="p-features" className="form-control" rows={5} value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} />
          </div>
          <label className="d-flex gap-2 align-center"><input type="checkbox" checked={form.isPopular} onChange={(e) => setForm({ ...form, isPopular: e.target.checked })} /> Mark as popular</label>
          <label className="d-flex gap-2 align-center"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Available for new subscriptions</label>
        </div>
        <div className="d-flex gap-2" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save plan'}</button>
          <Link className="btn btn-outline-secondary" to="/developer/plans">Cancel</Link>
        </div>
      </form>
    </>
  );
}
