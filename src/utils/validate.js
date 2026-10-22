const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNonNegativeNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isNonEmptyString = (v, max = 255) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const parseId = (v) => (/^[1-9]\d*$/.test(String(v)) ? Number(v) : null);
const isISODate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

module.exports = { isPositiveNumber, isNonNegativeNumber, isNonEmptyString, parseId, isISODate, round2 };
