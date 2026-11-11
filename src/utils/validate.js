const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNonNegativeNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isNonEmptyString = (v, max = 255) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const parseId = (v) => (/^[1-9]\d*$/.test(String(v)) ? Number(v) : null);
// Strict YYYY-MM-DD: rejects impossible dates such as 2026-02-31 and non-leap-year Feb 29.
const isISODate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

module.exports = { isPositiveNumber, isNonNegativeNumber, isNonEmptyString, parseId, isISODate, round2 };
