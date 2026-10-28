// Test double for authMiddleware: identity comes from x-role / x-user-id headers.
const fake = (req) => {
  req.user = { userId: Number(req.headers['x-user-id'] || 1), role: req.headers['x-role'] || 'Citizen' };
};
const verifyToken = (req, res, next) => {
  if (!req.headers['x-role']) return res.status(401).json({ code: 401, message: 'Access token missing' });
  fake(req); next();
};
const verifyRole = (roles) => (req, res, next) =>
  verifyToken(req, res, () =>
    roles.includes(req.user.role) || req.user.role === 'Admin'
      ? next()
      : res.status(403).json({ code: 403, message: 'Insufficient permissions' }));
module.exports = { verifyToken, verifyRole };
