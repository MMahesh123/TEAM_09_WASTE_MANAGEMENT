const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      message: 'Access token missing'
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      code: 500,
      message: 'Server configuration error'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(403).json({
      code: 403,
      message: 'Invalid token'
    });
  }
}

function verifyRole(requiredRoles) {
  return (req, res, next) => {
    verifyToken(req, res, () => {
      if (!requiredRoles.includes(req.user.role) && req.user.role !== 'Admin') {
        return res.status(403).json({
          code: 403,
          message: 'Insufficient permissions'
        });
      }

      return next();
    });
  };
}

module.exports = { verifyToken, verifyRole };