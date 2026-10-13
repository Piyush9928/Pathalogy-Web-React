import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('lsp.user');
    const storedHospital = localStorage.getItem('lsp.hospital');
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedHospital) setHospital(JSON.parse(storedHospital));
    setLoading(false);
  }, []);

  async function login({ hospitalCode, email, password }) {
    const response = await apiClient.post('/auth/login', { hospitalCode, email, password });
    const { token, user: loggedInUser, hospital: loggedInHospital } = response.data;

    localStorage.setItem('lsp.token', token);
    localStorage.setItem('lsp.user', JSON.stringify(loggedInUser));
    localStorage.setItem('lsp.hospital', JSON.stringify(loggedInHospital));
    localStorage.setItem('lsp.lastHospitalCode', loggedInHospital.code);

    setUser(loggedInUser);
    setHospital(loggedInHospital);
    return loggedInUser;
  }

  async function logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // ignore network errors on logout
    }
    localStorage.removeItem('lsp.token');
    localStorage.removeItem('lsp.user');
    localStorage.removeItem('lsp.hospital');
    setUser(null);
    setHospital(null);
  }

  async function changePassword({ currentPassword, newPassword }) {
    const response = await apiClient.post('/auth/change-password', { currentPassword, newPassword });
    // The server re-issues the token (the old one still demanded a password change).
    localStorage.setItem('lsp.token', response.data.token);
    const updated = { ...user, mustChangePassword: false };
    localStorage.setItem('lsp.user', JSON.stringify(updated));
    setUser(updated);
  }

  // Used after the hospital profile changes (e.g. a new logo) so the sidebar updates without signing in again.
  function updateHospital(patch) {
    setHospital((h) => {
      const next = { ...h, ...patch };
      localStorage.setItem('lsp.hospital', JSON.stringify(next));
      return next;
    });
  }

  function hasPermission(code) {
    if (!user) return false;
    return (user.permissions || []).some((p) => p.toLowerCase() === code.toLowerCase());
  }

  function hasRole(...roles) {
    if (!user) return false;
    return roles.some((r) => r.toLowerCase() === user.role.toLowerCase());
  }

  const value = useMemo(
    () => ({ user, hospital, loading, login, logout, changePassword, updateHospital, hasPermission, hasRole, isAuthenticated: !!user }),
    [user, hospital, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
