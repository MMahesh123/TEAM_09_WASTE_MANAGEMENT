const { parsePositiveInt, isValidISODate } = require('../src/utils/inputValidators');

describe('inputValidators', () => {
    describe('parsePositiveInt', () => {
        test.each([
            [7, 7],
            ['7', 7],
            [' 12 ', 12]
        ])('accepts %p', (input, expected) => {
            expect(parsePositiveInt(input)).toBe(expected);
        });

        test.each([0, -1, 1.5, '0', '-3', '1.5', '07', 'abc', '', null, undefined, true, {}, [], '99999999999999999999'])(
            'rejects %p',
            (input) => {
                expect(parsePositiveInt(input)).toBeNull();
            }
        );
    });

    describe('isValidISODate', () => {
        test.each(['2026-11-10', '2028-02-29', '2000-02-29', '2026-12-31'])('accepts %p', (input) => {
            expect(isValidISODate(input)).toBe(true);
        });

        test.each([
            '2026-02-31', // impossible day
            '2026-02-29', // not a leap year
            '1900-02-29', // century, not a leap year
            '2026-13-01',
            '2026-00-10',
            '2026-11-1',
            '10-11-2026',
            '2026/11/10',
            '',
            null,
            20261110
        ])('rejects %p', (input) => {
            expect(isValidISODate(input)).toBe(false);
        });
    });
});
