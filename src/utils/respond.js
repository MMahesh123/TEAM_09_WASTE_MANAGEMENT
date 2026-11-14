// Small response helpers shared by the disposal and payment controllers.
// Response shape stays { code, message, ... } to match the existing disposal/payment API.
const send = (res, code, message, extra = {}) => res.status(code).json({ code, message, ...extra });

const bad = (res, message) => send(res, 400, message);
const forbidden = (res) => send(res, 403, 'Insufficient permissions');
const notFound = (res, message) => send(res, 404, message);
const conflict = (res, message) => send(res, 409, message);

// Unexpected errors never leak database details to the client; they are logged server-side instead.
const serverError = (res, err) => {
  if (err && process.env.NODE_ENV !== 'test') console.error(err);
  return send(res, 500, 'Server error');
};

module.exports = { send, bad, forbidden, notFound, conflict, serverError };
