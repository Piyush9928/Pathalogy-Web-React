const jwt = require('jsonwebtoken');

/**
 * Builds a middleware that accepts only JWTs whose `kind` claim equals `kind`
 * ('developer' | 'doctor' | 'patient'). The decoded claims land on req.principal.
 * Staff tokens (no kind) and other kinds are rejected, so the four login types stay isolated.
 */
function requireKind(kind) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    if (payload.kind !== kind) {
      return res.status(403).json({ message: 'Access denied for this account type.' });
    }
    req.principal = payload;
    return next();
  };
}

function signKindToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

module.exports = { requireKind, signKindToken };
