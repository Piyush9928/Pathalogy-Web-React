import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import HospitalBrand from '../../components/HospitalBrand';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/Loader';

export default function SaleDetail() {
  const { id } = useParams();
  const { hospital } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get(`/pharmacy/sales/${id}`).then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Failed to load sale.'));
  }, [id]);

  if (error) return <div className="auth-alert">{error}</div>;
  if (!data) return <Loader />;
  const { sale, lines } = data;

  return (
    <>
      <PageHeader
        title={sale.sale_number}
        subtitle={sale.patient_name || sale.walk_in_name}
        actions={<button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print Receipt</button>}
      />

      <div className="lsp-panel">
        <HospitalBrand hospital={hospital} style={{ marginBottom: '0.8rem' }} />
        <dl className="detail-list">
          <div><dt>Date</dt><dd>{new Date(sale.sale_date).toLocaleString('en-IN')}</dd></div>
          <div><dt>Payment Mode</dt><dd>{sale.payment_mode}</dd></div>
          <div><dt>Paid Amount</dt><dd>₹{Number(sale.paid_amount).toLocaleString('en-IN')}</dd></div>
          {sale.doctors_name && <div><dt>Doctor</dt><dd>{sale.doctors_name}</dd></div>}
        </dl>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-list-ul" /></span> Items</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Medicine</th><th>Batches Used</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.item_name}</td>
                  <td>{line.batchesUsed.map((b) => `${b.batch_no} (${b.quantity_taken})`).join(', ')}</td>
                  <td>{line.quantity}</td>
                  <td>₹{Number(line.rate).toLocaleString('en-IN')}</td>
                  <td>{line.gst_percent}%</td>
                  <td>₹{(line.quantity * Number(line.rate)).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
