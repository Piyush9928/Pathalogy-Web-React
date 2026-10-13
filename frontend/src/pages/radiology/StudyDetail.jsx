import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { fetchBlobUrl, saveFile } from '../../api/files';

function isViewableImage(fileName) {
  return /\.(png|jpe?g)$/i.test(fileName);
}

export default function StudyDetail() {
  const { id } = useParams();
  const [study, setStudy] = useState(null);
  const [findings, setFindings] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [imageSrc, setImageSrc] = useState('');

  // Images are protected, so the picture is fetched with the login token and shown from a temporary object URL.
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    setImageSrc('');
    if (activeImage && isViewableImage(activeImage.file_name)) {
      fetchBlobUrl(activeImage.url)
        .then((url) => { objectUrl = url; if (cancelled) URL.revokeObjectURL(url); else setImageSrc(url); })
        .catch(() => { if (!cancelled) setError('Could not load the image.'); });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeImage]);

  async function load() {
    try {
      const res = await apiClient.get(`/radiology/studies/${id}`);
      setStudy(res.data);
      setFindings(res.data.findings || '');
      if (res.data.images.length > 0) setActiveImage((cur) => cur || res.data.images[0]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load radiology study.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFiles(e) {
    e.preventDefault();
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      await apiClient.post(`/radiology/studies/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFiles([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload files.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteImage(image) {
    if (!window.confirm(`Delete "${image.file_name}"? This removes the file permanently.`)) return;
    setError('');
    try {
      await apiClient.delete(`/radiology/studies/${id}/images/${image.id}`);
      if (activeImage?.id === image.id) setActiveImage(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete image.');
    }
  }

  async function saveFindings(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiClient.put(`/radiology/studies/${id}/findings`, { findings });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save findings.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !study) return <div className="auth-alert">{error}</div>;
  if (!study) return null;

  return (
    <>
      <PageHeader
        title={study.accession_number}
        subtitle={`${study.patient_name || study.walk_in_patient_name} ${study.patient_uhid ? `(${study.patient_uhid})` : '(walk-in)'} · ${study.modality} · ${study.body_part}`}
        actions={
          <>
            {study.is_cardiac_study && <Link className="btn btn-outline-secondary" to={`/radiology/echo/${study.id}/report`}><i className="bi bi-heart-pulse" /> Echo Report</Link>}
            <span className={`status-pill ${study.status === 'Reported' ? 'pill-teal' : 'pill-amber'}`} style={{ fontSize: '0.85rem' }}>{study.status}</span>
          </>
        }
      />
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <dl className="detail-list">
          <div><dt>Study Date</dt><dd>{new Date(study.study_date).toLocaleString('en-IN')}</dd></div>
          <div><dt>Referring Doctor</dt><dd>{study.referring_doctor_name || study.referred_by || '—'}</dd></div>
          {study.reported_by_name && <div><dt>Reported By</dt><dd>{study.reported_by_name} on {new Date(study.reported_on).toLocaleString('en-IN')}</dd></div>}
        </dl>
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '2fr 3fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-images" /></span> Images</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            {study.images.length === 0 ? (
              <p className="text-muted">No images uploaded yet.</p>
            ) : study.images.map((img) => (
              <div key={img.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ padding: '0.3rem 0.5rem', border: activeImage?.id === img.id ? '2px solid var(--lsp-primary)' : '1px solid var(--lsp-border)', background: 'var(--lsp-surface-alt)' }}
                  onClick={() => setActiveImage(img)}
                >
                  <i className={`bi ${isViewableImage(img.file_name) ? 'bi-file-image' : 'bi-file-earmark-medical'}`} /> {img.file_name.slice(0, 14)}
                </button>
              </div>
            ))}
          </div>

          {activeImage && (
            <div style={{ border: '1px solid var(--lsp-border)', borderRadius: 'var(--lsp-r)', padding: '0.6rem', marginBottom: '0.8rem', textAlign: 'center' }}>
              {isViewableImage(activeImage.file_name) ? (
                imageSrc
                  ? <img src={imageSrc} alt={activeImage.file_name} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 4 }} />
                  : <div className="text-muted" style={{ padding: '2rem 0' }}>Loading image...</div>
              ) : (
                <div className="text-muted" style={{ padding: '2rem 0' }}>
                  <i className="bi bi-file-earmark-medical" style={{ fontSize: '2rem' }} />
                  <p>DICOM file — no in-browser preview. Download to view in a DICOM viewer.</p>
                  <button type="button" className="btn btn-sm btn-outline-secondary"
                    onClick={() => saveFile(activeImage.url, activeImage.file_name).catch(() => setError('Could not download the file.'))}>
                    Download {activeImage.file_name}
                  </button>
                </div>
              )}
              <div className="d-flex justify-between align-center" style={{ marginTop: '0.5rem' }}>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>{(activeImage.size_bytes / 1024).toFixed(0)} KB · {new Date(activeImage.uploaded_on).toLocaleString('en-IN')}</span>
                <button className="btn btn-sm btn-danger" onClick={() => deleteImage(activeImage)}>Delete</button>
              </div>
            </div>
          )}

          <form onSubmit={uploadFiles} className="row-g">
            <input className="form-control" style={{ flex: '1 1 200px' }} type="file" multiple accept=".dcm,.dicom,.png,.jpg,.jpeg" onChange={(e) => setFiles(Array.from(e.target.files))} />
            <button className="btn btn-primary" type="submit" disabled={busy || files.length === 0}>Upload</button>
          </form>
        </div>

        <form onSubmit={saveFindings} className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-file-medical" /></span> Findings</h3>
          <div className="form-group">
            <textarea className="form-control" rows={14} placeholder="Enter radiology findings..." value={findings} onChange={(e) => setFindings(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>Save Findings &amp; Mark Reported</button>
        </form>
      </div>
    </>
  );
}
