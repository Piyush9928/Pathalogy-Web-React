import apiClient from './client';

// Uploaded files (radiology images, cross-match reports) are protected: the server only hands them to a signed-in user of
// the right hospital. A plain <img src> or <a href> cannot send the login token, so files are fetched through the API
// client and shown from a temporary object URL.
//
// `apiPath` is the server-relative path returned by the API, e.g. "/api/radiology/images/12/file". The API client's base
// URL already ends in /api, so that prefix is removed.
const relative = (apiPath) => apiPath.replace(/^\/api/, '');

export async function fetchBlobUrl(apiPath) {
  const res = await apiClient.get(relative(apiPath), { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

export async function saveFile(apiPath, fileName) {
  const url = await fetchBlobUrl(apiPath);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens a protected file (e.g. a PDF) in a new tab. */
export async function openFile(apiPath) {
  const url = await fetchBlobUrl(apiPath);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
