import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function BillWiseOutstanding() {
  const [outstanding, setOutstanding] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/accounting/bill-wise-outstanding').then((res) => setOutstanding(res.data.outstanding)).catch((err) => setError(err.response?.data?.message || 'Failed to load outstanding bills.'));
  }, []);

  function isOverdue(dueDate) {
    return dueDate && new Date(dueDate) < new Date();
  }

  return (
    <div className="lsp-panel">
      <h3><span className="h-ico"><i className="bi bi-hourglass-split" /></span> Bill-wise Outstanding</h3>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Ledger Account</th><th>Voucher #</th><th>Bill No.</th><th>Bill Date</th><th>Due Date</th><th>Amount</th></tr></thead>
          <tbody>
            {outstanding.length === 0 ? <tr><td colSpan={6}>No outstanding bills.</td></tr> : outstanding.map((o) => (
              <tr key={o.id}>
                <td>{o.ledger_account_name}</td>
                <td>{o.voucher_number}</td>
                <td>{o.bill_no}</td>
                <td>{o.bill_date ? new Date(o.bill_date).toLocaleDateString('en-IN') : '—'}</td>
                <td className={isOverdue(o.due_date) ? 'text-danger' : ''}>{o.due_date ? new Date(o.due_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>₹{(Number(o.dr_amount) || Number(o.cr_amount)).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
