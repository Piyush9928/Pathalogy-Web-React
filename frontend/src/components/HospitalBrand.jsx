import { useState } from 'react';
import { resolveLogoUrl } from '../utils/logo';

/**
 * Hospital logo + name for the top of printed documents (invoice, report, payslip, receipt, label).
 * Without a logo, or if the image cannot load, only the name is shown. `hospital` is { name, logoUrl }.
 */
export default function HospitalBrand({ hospital, size = 44, nameStyle, style }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const src = resolveLogoUrl(hospital?.logoUrl);
  const showLogo = src && failedUrl !== src;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', ...style }}>
      {showLogo && (
        <img
          src={src}
          alt=""
          style={{ width: size, height: size, objectFit: 'contain' }}
          onError={() => setFailedUrl(src)}
        />
      )}
      <div style={{ fontWeight: 700, ...nameStyle }}>{hospital?.name || 'LabSync Pro'}</div>
    </div>
  );
}
