import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

function blankRow() {
  return { gender: 'All', ageMin: 0, ageMax: 120, low: '', high: '', unit: '' };
}

export default function TestReferenceRanges() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get(`/tests/${id}`).then((res) => {
      setTest(res.data.test);
      const bands = res.data.referenceBands.map((b) => ({
        gender: b.gender, ageMin: b.age_min, ageMax: b.age_max, low: b.low || '', high: b.high || '', unit: b.unit || '',
      }));
      setRows(bands.length ? bands : [blankRow()]);
    }).catch((err) => setError(err.response?.data?.message || 'Failed to load test.'));
  }, [id]);

  function updateRow(index, field, value) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((r) => [...r, blankRow()]);
  }

  function removeRow(index) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await apiClient.put(`/tests/${id}/reference-bands`, { bands: rows });
      navigate('/laboratory');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save reference ranges.');
    } finally {
      setSaving(false);
    }
  }

  if (!test) return error ? <div className="auth-alert">{error}</div> : null;

  return (
    <>
      <PageHeader title={`Reference Ranges — ${test.name}`} subtitle={`Fallback: ${test.reference_range || 'not set'}`} />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <table className="lsp-table" style={{ marginBottom: '1rem' }}>
          <thead><tr><th>Gender</th><th>Age Min</th><th>Age Max</th><th>Low</th><th>High</th><th>Unit</th><th></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <select className="form-select" value={row.gender} onChange={(e) => updateRow(i, 'gender', e.target.value)}>
                    <option>All</option><option>Male</option><option>Female</option>
                  </select>
                </td>
                <td><input className="form-control" type="number" value={row.ageMin} onChange={(e) => updateRow(i, 'ageMin', e.target.value)} /></td>
                <td><input className="form-control" type="number" value={row.ageMax} onChange={(e) => updateRow(i, 'ageMax', e.target.value)} /></td>
                <td><input className="form-control" placeholder="e.g. 13.0 or <200" value={row.low} onChange={(e) => updateRow(i, 'low', e.target.value)} /></td>
                <td><input className="form-control" value={row.high} onChange={(e) => updateRow(i, 'high', e.target.value)} /></td>
                <td><input className="form-control" style={{ width: 90 }} value={row.unit} onChange={(e) => updateRow(i, 'unit', e.target.value)} /></td>
                <td><button className="btn btn-sm btn-danger" type="button" onClick={() => removeRow(i)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" type="button" onClick={addRow}><i className="bi bi-plus" /> Add Row</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Reference Ranges'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate('/laboratory')}>Cancel</button>
        </div>
      </div>
    </>
  );
}
