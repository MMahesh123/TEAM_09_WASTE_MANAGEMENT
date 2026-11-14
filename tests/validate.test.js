const { isISODate } = require('../src/utils/validate');

describe('isISODate', () => {
  it.each(['2026-01-01', '2026-10-31', '2026-12-31', '2024-02-29', '2000-02-29'])('accepts %s', (d) => {
    expect(isISODate(d)).toBe(true);
  });
  it.each([
    '2026-02-31', '2026-04-31', '2026-02-29', '2100-02-29', '2026-13-01', '2026-00-10',
    '2026-01-00', '2026-1-1', '26-01-01', '2026/01/01', '', 'not-a-date',
  ])('rejects %s', (d) => {
    expect(isISODate(d)).toBe(false);
  });
  it('treats leap years correctly', () => {
    expect(isISODate('2024-02-29')).toBe(true);   // divisible by 4
    expect(isISODate('2100-02-29')).toBe(false);  // century, not divisible by 400
    expect(isISODate('2000-02-29')).toBe(true);   // divisible by 400
  });
  it('rejects non-strings', () => {
    expect(isISODate(null)).toBe(false);
    expect(isISODate(20260101)).toBe(false);
    expect(isISODate(undefined)).toBe(false);
  });
});

describe('isTons', () => {
  const { isTons } = require('../src/utils/validate');
  it.each([0.01, 1, 12.5, 99.99, 99999999.99])('accepts %s', (v) => expect(isTons(v)).toBe(true));
  it.each([0, -1, 1.005, 0.001, 100000000, 1e12, NaN, Infinity, '5', null, undefined])(
    'rejects %s', (v) => expect(isTons(v)).toBe(false));
});
