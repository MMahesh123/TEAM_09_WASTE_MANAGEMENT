
const jwt = require('jsonwebtoken');

// Canonical role names used by the WMS project.
const ROLE_ALIASES = {
  admin: 'Admin',
  administrator: 'Admin',
  supervisor: 'Supervisor',
  worker: 'Worker',
  collector: 'Worker',
  driver: 'Worker',
  'driver / collection worker': 'Worker',
  citizen: 'Citizen',
  'service user': 'Citizen',
  'citizen / service user': 'Citizen',
};

// Normalize role names to prevent inconsistent casing or labels.
function normalizeRole(role) {
  if (typeof role !== 'string') {
    return null;
  }

  return ROLE_ALIASES[role.trim().toLowerCase()] || null;
}

// Verify the JWT and attach the authenticated user to the request.
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      message: 'Access token missing',
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: 'Access token missing',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      code: 500,
      message: 'Server configuration error',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid authentication token',
      });
    }

    const role = normalizeRole(decoded.role);

    if (!role) {
      return res.status(403).json({
        code: 403,
        message: 'User role is missing or unsupported',
      });
    }

    req.user = {
      ...decoded,
      role,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid or expired token',
    });
  }
}

// Authorize only the roles explicitly allowed for this operation.
// This middleware expects verifyToken to run first.
function verifyRole(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('verifyRole requires at least one allowed role');
  }

  const normalizedRoles = allowedRoles.map(normalizeRole);

  if (normalizedRoles.some((role) => !role)) {
    throw new Error('verifyRole received an unsupported role');
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: 'Authentication required',
      });
    }

    if (!normalizedRoles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        message: 'Insufficient permissions',
      });
    }

    return next();
  };
}

module.exports = {
  verifyToken,
  verifyRole,
  normalizeRole,
};
