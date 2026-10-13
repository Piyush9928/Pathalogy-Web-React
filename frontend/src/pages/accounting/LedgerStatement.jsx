import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function LedgerStatement() {
  const { accountId } = useParams();
  const [data, setData] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/accounting/ledger-statement/${accountId}`, { params: { fromDate, toDate } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load ledger statement.');
    }
  }

  useEffect(() => { load(); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFilter(e) {
    e.preventDefault();
    await load();
  }

  if (error && !data) return <div className="auth-alert">{error}</div>;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={data.account.name}
        subtitle={`Ledger Statement · Opening Balance ₹${Number(data.account.opening_balance).toLocaleString('en-IN')} ${data.account.opening_balance_type}`}
        actions={<button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>}
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleFilter} className="row-g" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ flex: '1 1 160px' }} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="form-control" style={{ flex: '1 1 160px' }} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-funnel" /> Filter</button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Date</th><th>Voucher #</th><th>Type</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
            <tbody>
              {data.entries.length === 0 ? <tr><td colSpan={7}>No entries in this period.</td></tr> : data.entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.voucher_date).toLocaleDateString('en-IN')}</td>
                  <td>{e.voucher_number}</td>
                  <td><span className="status-pill pill-neutral">{e.voucher_type}</span></td>
                  <td>{e.narration || e.bill_no || '—'}</td>
                  <td>{Number(e.dr_amount) > 0 ? `₹${Number(e.dr_amount).toLocaleString('en-IN')}` : ''}</td>
                  <td>{Number(e.cr_amount) > 0 ? `₹${Number(e.cr_amount).toLocaleString('en-IN')}` : ''}</td>
                  <td>₹{Math.abs(e.runningBalance).toLocaleString('en-IN')} {e.runningBalanceType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'right', marginTop: '1rem', fontWeight: 700, fontSize: '1.1rem' }}>
          Closing Balance: ₹{Number(data.closingBalance).toLocaleString('en-IN')} {data.closingBalanceType}
        </div>
      </div>
    </>
  );
}
