import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [voucherTypes, setVoucherTypes] = useState([]);
  const [voucherType, setVoucherType] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/accounting/vouchers', { params: { voucherType } });
      setVouchers(res.data.vouchers);
      setVoucherTypes(res.data.voucherTypes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load vouchers.');
    }
  }

  useEffect(() => { load(); }, [voucherType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelVoucher(v) {
    if (!window.confirm(`Cancel voucher "${v.voucher_number}"?`)) return;
    try {
      await apiClient.delete(`/accounting/vouchers/${v.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel voucher.');
    }
  }

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/accounting/vouchers/new"><i className="bi bi-plus-lg" /> New Voucher</Link>
        </div>
      </div>

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <select className="form-select" style={{ maxWidth: 200, marginBottom: '1rem' }} value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
          <option value="">All Types</option>
          {voucherTypes.map((t) => <option key={t}>{t}</option>)}
        </select>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Voucher #</th><th>Type</th><th>Date</th><th>Narration</th><th>Debit</th><th>Credit</th><th></th></tr></thead>
            <tbody>
              {vouchers.length === 0 ? <tr><td colSpan={7}>No vouchers found.</td></tr> : vouchers.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/accounting/vouchers/${v.id}`}>{v.voucher_number}</Link></td>
                  <td><span className="status-pill pill-neutral">{v.voucher_type}</span></td>
                  <td>{new Date(v.voucher_date).toLocaleDateString('en-IN')}</td>
                  <td>{v.narration || '—'}</td>
                  <td>₹{Number(v.total_debit).toLocaleString('en-IN')}</td>
                  <td>₹{Number(v.total_credit).toLocaleString('en-IN')}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => cancelVoucher(v)}>Cancel</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
