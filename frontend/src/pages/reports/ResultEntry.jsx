import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

function parseRange(rangeStr) {
  if (!rangeStr) return null;
  const match = String(rangeStr).match(/(-?\d+(\.\d+)?)\s*-\s*(-?\d+(\.\d+)?)/);
  if (!match) return null;
  return { low: parseFloat(match[1]), high: parseFloat(match[3]) };
}

// Client-side live preview only - the server always recomputes the authoritative flag
// using the analyte's real critical thresholds on save (see backend resultFlagging.js).
function previewFlag(value, rangeStr) {
  const numeric = parseFloat(value);
  if (Number.isNaN(numeric)) return 'Normal';
  const range = parseRange(rangeStr);
  if (!range) return 'Normal';
  if (numeric < range.low) return 'Low';
  if (numeric > range.high) return 'High';
  return 'Normal';
}

function flagPill(flag) {
  if (flag === 'Critical') return 'pill-danger';
  if (flag === 'High' || flag === 'Low') return 'pill-warning';
  return 'pill-success';
}

export default function ResultEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get(`/reports/${id}/entry-form`).then((res) => {
      setRows(res.data.rows.map((r) => ({
        bookingTestId: r.booking_test_id, analyteId: r.analyte_id, analyteName: r.analyte_name,
        value: r.value || '', unit: r.unit || '', referenceRange: r.reference_range || '',
        flag: r.flag || 'Normal', isCalculated: r.is_calculated || false, formula: r.formula || null,
        resultType: r.result_type, predefinedValues: r.predefined_values,
      })));
      setPatient(res.data.patient);
    }).catch((err) => setError(err.response?.data?.message || 'Failed to load entry form.'));
  }, [id]);

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const updated = { ...row, [field]: value };
      if (field === 'value' || field === 'referenceRange') {
        updated.flag = previewFlag(field === 'value' ? value : row.value, field === 'referenceRange' ? value : row.referenceRange);
      }
      return updated;
    }));
  }

  function addRow() {
    setRows((prev) => [...prev, { analyteId: null, analyteName: '', value: '', unit: '', referenceRange: '', flag: 'Normal' }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await apiClient.put(`/reports/${id}/results`, { results: rows });
      navigate(`/reports/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save results.');
    } finally {
      setSaving(false);
    }
  }

  if (error && rows.length === 0) return <div className="auth-alert">{error}</div>;

  return (
    <>
      <PageHeader title="Result Entry" subtitle={patient ? `Patient: ${patient.gender}, ${patient.age} yrs` : ''} />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
          <table className="lsp-table">
            <thead><tr><th>Analyte / Test</th><th>Value</th><th>Unit</th><th>Reference Range</th><th>Flag</th><th></th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 180 }}>
                    <input className="form-control" value={row.analyteName} onChange={(e) => updateRow(i, 'analyteName', e.target.value)} placeholder="Analyte name" />
                  </td>
                  <td style={{ minWidth: 120 }}>
                    {row.resultType === 'Dropdown' && row.predefinedValues ? (
                      <select className="form-select" value={row.value} onChange={(e) => updateRow(i, 'value', e.target.value)}>
                        <option value="">Select</option>
                        {row.predefinedValues.split(',').map((v) => <option key={v.trim()} value={v.trim()}>{v.trim()}</option>)}
                      </select>
                    ) : (
                      <input className="form-control" value={row.value} onChange={(e) => updateRow(i, 'value', e.target.value)} />
                    )}
                  </td>
                  <td style={{ minWidth: 90 }}>
                    <input className="form-control" value={row.unit} readOnly onChange={(e) => updateRow(i, 'unit', e.target.value)} />
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <input className="form-control" value={row.referenceRange} readOnly onChange={(e) => updateRow(i, 'referenceRange', e.target.value)} />
                  </td>
                  <td>
                    <select className="form-select" value={row.flag} onChange={(e) => updateRow(i, 'flag', e.target.value)}>
                      <option>Normal</option><option>Low</option><option>High</option><option>Critical</option>
                    </select>
                    <span className={`status-pill ${flagPill(row.flag)}`} style={{ marginTop: '0.3rem', display: 'inline-block' }}>{row.flag}</span>
                  </td>
                  <td><button className="btn btn-sm btn-danger" type="button" onClick={() => removeRow(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" type="button" onClick={addRow}><i className="bi bi-plus" /> Add Analyte Row</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Results'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
        <p className="text-muted mt-3" style={{ fontSize: '0.78rem' }}>
          Flag shown here is a live preview. The server recalculates the final flag using each analyte's
          actual critical thresholds and gender/age-specific reference band when you save.
        </p>
      </div>
    </>
  );
}
