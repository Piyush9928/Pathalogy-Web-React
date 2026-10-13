import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { resolveLogoUrl } from '../../utils/logo';
import Loader from '../../components/Loader';

const MAX_LOGO_BYTES = 512 * 1024;

function toFormShape(row) {
  return {
    name: row.name || '',
    legalName: row.legal_name || '',
    gstin: row.gstin || '',
    nablNumber: row.nabl_number || '',
    email: row.email || '',
    phone: row.phone || '',
    website: row.website || '',
    address: row.address || '',
    defaultGstPercent: row.default_gst_percent || 18,
    currency: row.currency || 'INR',
    reportFooterNote: row.report_footer_note || '',
    uhidPrefix: row.uhid_prefix || 'UHID',
    invoiceDueDays: row.invoice_due_days || 15,
    enableEmailNotifications: row.enable_email_notifications,
    enableSmsNotifications: row.enable_sms_notifications,
    enableWhatsappNotifications: row.enable_whatsapp_notifications,
    barcodePrefix: row.barcode_prefix || 'SMP',
    barcodeNumberLength: row.barcode_number_length || 6,
    barcodeSymbology: row.barcode_symbology || 'Code128',
    printQrCodeOnLabel: row.print_qr_code_on_label,
    upiId: row.upi_id || '',
    upiPayeeName: row.upi_payee_name || '',
  };
}

export default function CompanySettings() {
  const { hospital, updateHospital, hasPermission } = useAuth();
  const [logoBusy, setLogoBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .get('/company-settings')
      .then((res) => {
        setForm(toFormShape(res.data.settings));
        setCounts(res.data.counts);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load company settings.'));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiClient.put('/company-settings', form);
      setMessage('Company settings updated.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setError('');
    setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('Choose a PNG, JPG or WebP image.');
    if (file.size > MAX_LOGO_BYTES) return setError('The logo must be 512 KB or smaller.');
    const body = new FormData();
    body.append('logo', file);
    setLogoBusy(true);
    try {
      const res = await apiClient.post('/company-settings/logo', body);
      updateHospital({ logoUrl: res.data.logoUrl });
      setMessage('Logo updated.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload the logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    if (!window.confirm('Remove the hospital logo?')) return;
    setError('');
    setMessage('');
    setLogoBusy(true);
    try {
      await apiClient.delete('/company-settings/logo');
      updateHospital({ logoUrl: null });
      setMessage('Logo removed.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove the logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  if (!form) return error ? <div className="auth-alert">{error}</div> : <Loader />;

  return (
    <>
      {counts && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{counts.branches}</div><div className="kpi-label">Branches</div></div>
          <div className="kpi-card"><div className="kpi-value">{counts.users}</div><div className="kpi-label">Users</div></div>
          <div className="kpi-card"><div className="kpi-value">{counts.roles}</div><div className="kpi-label">Roles</div></div>
          <div className="kpi-card"><div className="kpi-value">{counts.audit_events}</div><div className="kpi-label">Audit Events</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <h3><span className="h-ico"><i className="bi bi-image" /></span> Logo</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <img
            src={resolveLogoUrl(hospital?.logoUrl) || '/logo.svg'}
            alt="Current hospital logo"
            style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid var(--lsp-border, #e5e7eb)', borderRadius: 8, padding: 4 }}
          />
          {hasPermission('settings.edit') && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-outline" style={{ margin: 0, cursor: logoBusy ? 'wait' : 'pointer' }}>
                {logoBusy ? 'Working...' : 'Upload new logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoPick} disabled={logoBusy} style={{ display: 'none' }} />
              </label>
              {hospital?.logoUrl && (
                <button type="button" className="btn btn-outline" onClick={handleLogoRemove} disabled={logoBusy}>Remove</button>
              )}
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>PNG, JPG or WebP, up to 512 KB.</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-building" /></span> Company Details</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Name</label>
            <input className="form-control" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Legal Name</label>
            <input className="form-control" value={form.legalName} onChange={(e) => update('legalName', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">GSTIN</label>
            <input className="form-control" value={form.gstin} onChange={(e) => update('gstin', e.target.value)} />
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Phone</label>
            <input className="form-control" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Website</label>
            <input className="form-control" value={form.website} onChange={(e) => update('website', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <input className="form-control" value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-receipt" /></span> Billing &amp; Barcode</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Default GST %</label>
            <input className="form-control" type="number" step="0.01" value={form.defaultGstPercent} onChange={(e) => update('defaultGstPercent', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">UHID Prefix</label>
            <input className="form-control" value={form.uhidPrefix} onChange={(e) => update('uhidPrefix', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Invoice Due Days</label>
            <input className="form-control" type="number" value={form.invoiceDueDays} onChange={(e) => update('invoiceDueDays', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Barcode Prefix</label>
            <input className="form-control" value={form.barcodePrefix} onChange={(e) => update('barcodePrefix', e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-bell" /></span> Notifications</h3>
        <div className="row-g">
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={!!form.enableEmailNotifications} onChange={(e) => update('enableEmailNotifications', e.target.checked)} /> Email</label>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={!!form.enableSmsNotifications} onChange={(e) => update('enableSmsNotifications', e.target.checked)} /> SMS</label>
          <label className="d-flex align-center gap-2"><input type="checkbox" checked={!!form.enableWhatsappNotifications} onChange={(e) => update('enableWhatsappNotifications', e.target.checked)} /> WhatsApp</label>
        </div>

        <button className="btn btn-primary mt-3" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </>
  );
}
