const {
    defaultStudyAbbreviationToStudyName,
    defaultStudyAbbreviationToNA,
    isStudyAbbreviationEmpty
} = require('../../utility/study-abbrev-helpers');

describe('study-abbrev-helpers', () => {
    describe('defaultStudyAbbreviationToStudyName', () => {
        it('returns trimmed abbrev when present', () => {
            expect(defaultStudyAbbreviationToStudyName('  AB  ', 'Full Name')).toBe('AB');
        });
        it('returns fullName when abbrev null or empty or whitespace', () => {
            expect(defaultStudyAbbreviationToStudyName(null, 'Full Study')).toBe('Full Study');
            expect(defaultStudyAbbreviationToStudyName('', 'Full Study')).toBe('Full Study');
            expect(defaultStudyAbbreviationToStudyName('  \t ', 'Full Study')).toBe('Full Study');
        });
        it('returns empty string when both missing', () => {
            expect(defaultStudyAbbreviationToStudyName(null, null)).toBe('');
            expect(defaultStudyAbbreviationToStudyName(' ', '  ')).toBe('');
        });
    });

    describe('defaultStudyAbbreviationToNA', () => {
        it('returns trimmed abbrev when present', () => {
            expect(defaultStudyAbbreviationToNA('  x  ')).toBe('x');
        });
        it('returns NA when null empty or whitespace', () => {
            expect(defaultStudyAbbreviationToNA(null)).toBe('NA');
            expect(defaultStudyAbbreviationToNA('')).toBe('NA');
            expect(defaultStudyAbbreviationToNA('   ')).toBe('NA');
        });
    });

    describe('isStudyAbbreviationEmpty', () => {
        it('returns true for null, undefined, empty, or whitespace-only', () => {
            expect(isStudyAbbreviationEmpty(null)).toBe(true);
            expect(isStudyAbbreviationEmpty(undefined)).toBe(true);
            expect(isStudyAbbreviationEmpty('')).toBe(true);
            expect(isStudyAbbreviationEmpty('   \t')).toBe(true);
        });
        it('returns false when abbrev has non-whitespace content', () => {
            expect(isStudyAbbreviationEmpty('A')).toBe(false);
            expect(isStudyAbbreviationEmpty('  x  ')).toBe(false);
        });
    });
});
