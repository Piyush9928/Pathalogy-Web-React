import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function DailyLedger() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/accounting/daily-ledger', { params: { date } });
      setEntries(res.data.entries);
      setTotals(res.data.totals);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load daily ledger.');
    }
  }

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-calendar3" /></span> Daily Ledger</h3>
        <input className="form-control" style={{ maxWidth: 200 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Voucher #</th><th>Type</th><th>Ledger Account</th><th>Debit</th><th>Credit</th><th>Narration</th></tr></thead>
          <tbody>
            {entries.length === 0 ? <tr><td colSpan={6}>No postings on this date.</td></tr> : entries.map((e) => (
              <tr key={e.id}>
                <td>{e.voucher_number}</td>
                <td><span className="status-pill pill-neutral">{e.voucher_type}</span></td>
                <td>{e.ledger_account_name}</td>
                <td>{Number(e.dr_amount) > 0 ? `₹${Number(e.dr_amount).toLocaleString('en-IN')}` : ''}</td>
                <td>{Number(e.cr_amount) > 0 ? `₹${Number(e.cr_amount).toLocaleString('en-IN')}` : ''}</td>
                <td>{e.narration || '—'}</td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3}>Total</td>
                <td>₹{totals.debit.toLocaleString('en-IN')}</td>
                <td>₹{totals.credit.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
