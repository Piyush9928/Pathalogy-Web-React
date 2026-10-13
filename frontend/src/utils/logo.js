// A hospital logo is stored either as an absolute https URL or as the API's own path (/api/branding/logo/<id>).
// The own-path form must be resolved against the API server, which is not the origin the app itself is served from.
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function resolveLogoUrl(url) {
  if (!url) return null;
  if (url.startsWith('/api/')) return apiBase.replace(/\/api\/?$/, '') + url;
  return url;
}
