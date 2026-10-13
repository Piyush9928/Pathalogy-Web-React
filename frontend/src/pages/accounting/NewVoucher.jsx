import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_LINE = { ledgerAccountId: '', drAmount: '', crAmount: '' };

export default function NewVoucher() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [voucherType, setVoucherType] = useState('Journal');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/accounting/accounts').then((res) => setAccounts(res.data.accounts)).catch(() => {});
  }, []);

  function updateLine(idx, field, value) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  }

  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  const totalDr = lines.reduce((s, l) => s + Number(l.drAmount || 0), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.crAmount || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const validLines = lines.filter((l) => l.ledgerAccountId && (Number(l.drAmount) > 0 || Number(l.crAmount) > 0));
    if (validLines.length < 2) return setError('A voucher requires at least 2 complete lines.');
    if (!isBalanced) return setError(`Voucher is not balanced: Debit ₹${totalDr.toFixed(2)} ≠ Credit ₹${totalCr.toFixed(2)}.`);

    setSaving(true);
    try {
      const res = await apiClient.post('/accounting/vouchers', { voucherType, voucherDate, narration, lines: validLines });
      navigate(`/accounting/vouchers/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create voucher.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New Voucher" />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Voucher Type</label>
            <select className="form-select" value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
              {['Payment', 'Receipt', 'Journal', 'Contra'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Date</label>
            <input className="form-control" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '2 1 260px' }}>
            <label className="form-label">Narration</label>
            <input className="form-control" value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: '1rem' }}><span className="h-ico"><i className="bi bi-list-ol" /></span> Voucher Lines</h3>
        {lines.map((line, idx) => (
          <div className="row-g" key={idx} style={{ marginBottom: '0.4rem' }}>
            <select className="form-select" style={{ flex: '2 1 220px' }} value={line.ledgerAccountId} onChange={(e) => updateLine(idx, 'ledgerAccountId', e.target.value)}>
              <option value="">Select ledger account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className="form-control" style={{ flex: '1 1 120px' }} type="number" placeholder="Debit" value={line.drAmount} onChange={(e) => updateLine(idx, 'drAmount', e.target.value)} />
            <input className="form-control" style={{ flex: '1 1 120px' }} type="number" placeholder="Credit" value={line.crAmount} onChange={(e) => updateLine(idx, 'crAmount', e.target.value)} />
            {lines.length > 2 && <button className="btn btn-sm btn-danger" type="button" onClick={() => removeLine(idx)}>×</button>}
          </div>
        ))}
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={addLine} style={{ marginBottom: '1rem' }}><i className="bi bi-plus-lg" /> Add Line</button>

        <div className="d-flex justify-between align-center" style={{ padding: '0.6rem 0', borderTop: '1px solid var(--lsp-border)' }}>
          <span>Total Debit: <strong>₹{totalDr.toFixed(2)}</strong></span>
          <span>Total Credit: <strong>₹{totalCr.toFixed(2)}</strong></span>
          <span className={isBalanced ? 'text-success' : 'text-danger'}>{isBalanced ? '✓ Balanced' : '✗ Not Balanced'}</span>
        </div>

        <div className="d-flex gap-2" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={saving || !isBalanced}>{saving ? 'Saving...' : 'Save Voucher'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
