import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

  return children;
}
