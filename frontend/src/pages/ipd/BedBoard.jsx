import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

function bedTone(status) {
  if (status === 'Occupied') return { bg: 'var(--lsp-danger-50)', border: 'var(--lsp-danger)', text: 'var(--lsp-danger)' };
  if (status === 'Reserved') return { bg: 'var(--lsp-warning-50)', border: 'var(--lsp-warning)', text: 'var(--lsp-warning)' };
  if (status === 'Cleaning') return { bg: 'var(--lsp-accent-50)', border: 'var(--lsp-primary)', text: 'var(--lsp-primary)' };
  if (status === 'Out of Service') return { bg: 'var(--lsp-surface-alt)', border: 'var(--lsp-border-strong)', text: 'var(--lsp-text-muted)' };
  return { bg: 'var(--lsp-success-50)', border: 'var(--lsp-success)', text: 'var(--lsp-success)' };
}

export default function BedBoard() {
  const [wards, setWards] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/wards/bed-board/all');
      setWards(res.data.wards);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bed board.');
    }
  }

  useEffect(() => { load(); }, []);

  async function setBedStatus(bed, status) {
    try {
      await apiClient.patch(`/wards/beds/${bed.id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update bed status.');
    }
  }

  const totalBeds = wards.reduce((s, w) => s + w.beds.length, 0);
  const occupied = wards.reduce((s, w) => s + w.beds.filter((b) => b.status === 'Occupied').length, 0);

  return (
    <>
      <PageHeader
        title="Visual Bed Board"
        subtitle={`${occupied} / ${totalBeds} beds occupied`}
        actions={<Link className="btn btn-outline-secondary" to="/ipd/wards"><i className="bi bi-diagram-3" /> Manage Wards</Link>}
      />
      {error && <div className="auth-alert">{error}</div>}

      {wards.map((ward) => (
        <div className="lsp-panel" key={ward.id}>
          <h3><span className="h-ico"><i className="bi bi-hospital" /></span> {ward.name} <span className="status-pill pill-neutral" style={{ marginLeft: '0.5rem' }}>{ward.category}</span></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.7rem' }}>
            {ward.beds.map((bed) => {
              const tone = bedTone(bed.status);
              return (
                <div key={bed.id} style={{ border: `1.5px solid ${tone.border}`, background: tone.bg, borderRadius: 'var(--lsp-r)', padding: '0.7rem' }}>
                  <div style={{ fontWeight: 700, color: tone.text }}>Bed {bed.bed_number}</div>
                  <div style={{ fontSize: '0.72rem', color: tone.text, marginBottom: '0.4rem' }}>{bed.status}</div>
                  {bed.patient_name && (
                    <div style={{ fontSize: '0.75rem' }}>
                      <div style={{ fontWeight: 600 }}>{bed.patient_name}</div>
                      <div className="text-muted">{bed.patient_uhid}</div>
                      <Link to={`/ipd/admissions/${bed.admission_id}`} style={{ fontSize: '0.7rem' }}>View admission</Link>
                    </div>
                  )}
                  {bed.status !== 'Occupied' && (
                    <select className="form-select" style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', marginTop: '0.3rem' }} value={bed.status} onChange={(e) => setBedStatus(bed, e.target.value)}>
                      {['Available', 'Reserved', 'Cleaning', 'Out of Service'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
