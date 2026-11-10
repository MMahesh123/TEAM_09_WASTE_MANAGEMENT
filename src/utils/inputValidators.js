// Shared input helpers for the assignment and collection modules.

// Accepts positive integers given as numbers or digit-only strings ("7", 7). Returns null otherwise.
function parsePositiveInt(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
        const n = Number(value.trim());
        return Number.isSafeInteger(n) ? n : null;
    }
    return null;
}

// Strict YYYY-MM-DD that is also a real calendar date (rejects 2026-02-31, accepts 2028-02-29).
function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
        date.getUTCFullYear() === y &&
        date.getUTCMonth() === m - 1 &&
        date.getUTCDate() === d
    );
}

module.exports = { parsePositiveInt, isValidISODate };
