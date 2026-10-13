// A hospital logo is stored either as an absolute https URL or as the API's own path (/api/branding/logo/<id>).
// The own-path form must be resolved against the API server, which is not the origin the app itself is served from.
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function resolveLogoUrl(url) {
  if (!url) return null;
  if (url.startsWith('/api/')) return apiBase.replace(/\/api\/?$/, '') + url;
  return url;
}

// Logo for a hospital code, usable before anyone is signed in (404 when the hospital has no logo).
export function logoUrlByCode(code) {
  const clean = String(code || '').trim();
  if (!/^[A-Za-z0-9]{3,30}$/.test(clean)) return null;
  return `${apiBase.replace(/\/$/, '')}/branding/by-code/${clean}/logo`;
}
