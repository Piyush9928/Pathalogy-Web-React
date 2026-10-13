import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { firstAdminPath, firstAllowedPath, permissionForPath } from '../config/navigation';

export default function ProtectedRoute({ children, roles, permission }) {
  const { user, loading, hasPermission, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !hasRole(...roles)) {
    return <Navigate to="/access-denied" replace />;
  }
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/access-denied" replace />;
  }

  // Page-level rule for the main app: the page needs the same permission its menu entry needs.
  // Someone without it is sent to the first page they CAN open (so a limited user lands on their own
  // menu, not on an "Access Denied" screen); "Access Denied" is only shown when they can open nothing.
  if (!roles && !permission) {
    const required = permissionForPath(location.pathname);
    if (required && !hasPermission(required)) {
      const fallback = firstAllowedPath(hasPermission);
      if (fallback && fallback !== location.pathname) return <Navigate to={fallback} replace />;
      return <Navigate to="/access-denied" replace />;
    }
    // "/admin" itself is Company Settings; a user who only has e.g. Users access goes straight to that tab.
    if (location.pathname === '/admin' && !hasPermission('settings.view')) {
      const tab = firstAdminPath(hasPermission);
      if (tab) return <Navigate to={tab} replace />;
    }
  }
  return children;
}
