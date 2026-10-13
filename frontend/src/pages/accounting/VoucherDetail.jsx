import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function VoucherDetail() {
  const { id } = useParams();
  const [voucher, setVoucher] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get(`/accounting/vouchers/${id}`).then((res) => setVoucher(res.data)).catch((err) => setError(err.response?.data?.message || 'Failed to load voucher.'));
  }, [id]);

  if (error) return <div className="auth-alert">{error}</div>;
  if (!voucher) return null;

  return (
    <>
      <PageHeader
        title={voucher.voucher_number}
        subtitle={`${voucher.voucher_type} · ${new Date(voucher.voucher_date).toLocaleDateString('en-IN')}`}
        actions={voucher.is_cancelled ? <span className="status-pill pill-neutral">Cancelled</span> : <button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>}
      />

      <div className="lsp-panel">
        {voucher.narration && <p><strong>Narration:</strong> {voucher.narration}</p>}
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Ledger Account</th><th>Debit</th><th>Credit</th><th>Bill Ref.</th></tr></thead>
            <tbody>
              {voucher.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.ledger_account_name}</td>
                  <td>{Number(l.dr_amount) > 0 ? `₹${Number(l.dr_amount).toLocaleString('en-IN')}` : ''}</td>
                  <td>{Number(l.cr_amount) > 0 ? `₹${Number(l.cr_amount).toLocaleString('en-IN')}` : ''}</td>
                  <td>{l.bill_no || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td>₹{voucher.lines.reduce((s, l) => s + Number(l.dr_amount), 0).toLocaleString('en-IN')}</td>
                <td>₹{voucher.lines.reduce((s, l) => s + Number(l.cr_amount), 0).toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
