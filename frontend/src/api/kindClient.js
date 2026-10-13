import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// The platform console, doctor portal and patient portal each keep their own session so they
// never mix with the hospital staff session (lsp.*) or with each other.
const KINDS = {
  developer: { storageKey: 'lsp.developer', loginPath: '/developer/login' },
  doctor: { storageKey: 'lsp.doctorPortal', loginPath: '/doctor-portal/login' },
  patient: { storageKey: 'lsp.patientPortal', loginPath: '/patient-portal/login' },
};

export function getSession(kind) {
  try {
    return JSON.parse(localStorage.getItem(KINDS[kind].storageKey)) || null;
  } catch {
    return null;
  }
}

export function setSession(kind, session) {
  localStorage.setItem(KINDS[kind].storageKey, JSON.stringify(session));
}

export function clearSession(kind) {
  localStorage.removeItem(KINDS[kind].storageKey);
}

function createClient(kind) {
  const client = axios.create({ baseURL });
  client.interceptors.request.use((config) => {
    const token = getSession(kind)?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Expired/invalid token on an authenticated call: drop the session and go to this portal's sign-in.
      const isAuthCall = error.config?.url?.includes('/login') || error.config?.url?.includes('/request-otp');
      if (error.response?.status === 401 && !isAuthCall) {
        clearSession(kind);
        window.location.href = KINDS[kind].loginPath;
      }
      return Promise.reject(error);
    }
  );
  return client;
}

export const developerApi = createClient('developer');
export const doctorApi = createClient('doctor');
export const patientApi = createClient('patient');
