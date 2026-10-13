import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { firstAllowedPath } from '../config/navigation';

export default function AccessDenied() {
  const { hasPermission } = useAuth();
  const home = firstAllowedPath(hasPermission);
  return (
    <div className="lsp-panel">
      <div className="empty-state">
        <span className="es-ico"><i className="bi bi-shield-lock" /></span>
        <h4>Access Denied</h4>
        <p>You don't have permission to view this page.</p>
        {home && <Link className="btn btn-primary mt-3" to={home}>Go to my home page</Link>}
      </div>
    </div>
  );
}
