const {
    isCaseInsensitiveEqual,
    isElementInArray,
    isElementInArrayCaseInsensitive,
    isUndefined,
    getUniqueArr,
    parseArrToStr,
    replaceMessageVariables,
    extractAndJoinFields,
    toPascalCase,
    replaceErrorString,
    isValidFileExtension,
    fileSizeFormatter,
    getFormatDateStr
} = require('../../utility/string-util');

describe('string-util', () => {
    describe('isCaseInsensitiveEqual', () => {
        it('returns true for equal strings with different cases', () => {
            expect(isCaseInsensitiveEqual('Test', 'test')).toBe(true);
        });
        it('returns false for different strings', () => {
            expect(isCaseInsensitiveEqual('Test', 'toast')).toBe(false);
        });
        it('returns false if either argument is falsy', () => {
            expect(isCaseInsensitiveEqual('', 'test')).toBe(false);
            expect(isCaseInsensitiveEqual('test', '')).toBe(false);
            expect(isCaseInsensitiveEqual(null, 'test')).toBe(false);
            expect(isCaseInsensitiveEqual('test', undefined)).toBe(false);
        });
    });

    describe('isElementInArray', () => {
        it('returns true if element is in array', () => {
            expect(isElementInArray(['a', 'b', 'c'], 'b')).toBe(true);
        });
        it('returns false if element is not in array', () => {
            expect(isElementInArray(['a', 'b', 'c'], 'd')).toBe(false);
        });
        it('returns false if array or target is falsy', () => {
            expect(isElementInArray(null, 'a')).toBe(false);
            expect(isElementInArray(['a'], null)).toBe(false);
        });
    });

    describe('isElementInArrayCaseInsensitive', () => {
        it('returns true for case-insensitive match', () => {
            expect(isElementInArrayCaseInsensitive(['A', 'b', 'C'], 'c')).toBe(true);
        });
        it('returns false if no match', () => {
            expect(isElementInArrayCaseInsensitive(['a', 'b'], 'z')).toBe(false);
        });
        it('returns false if array or target is falsy', () => {
            expect(isElementInArrayCaseInsensitive(null, 'a')).toBe(false);
            expect(isElementInArrayCaseInsensitive(['a'], null)).toBe(false);
        });
    });

    describe('isUndefined', () => {
        it('returns true if value is undefined', () => {
            expect(isUndefined(undefined)).toBe(true);
        });
        it('returns false for defined values', () => {
            expect(isUndefined(null)).toBe(false);
            expect(isUndefined(0)).toBe(false);
            expect(isUndefined('')).toBe(false);
        });
    });

    describe('getUniqueArr', () => {
        it('returns unique values', () => {
            expect(getUniqueArr([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
        });
        it('returns empty array if input is falsy', () => {
            expect(getUniqueArr(null)).toEqual([]);
        });
    });

    describe('parseArrToStr', () => {
        it('joins array with comma by default', () => {
            expect(parseArrToStr(['a', 'b', 'c'])).toBe('a,b,c');
        });
        it('joins array with custom splitter', () => {
            expect(parseArrToStr(['a', 'b', 'c'], '|')).toBe('a|b|c');
        });
        it('filters out empty strings and falsy values', () => {
            expect(parseArrToStr(['a', '', null, 'b'])).toBe('a,b');
        });
        it('returns empty string if input is falsy', () => {
            expect(parseArrToStr(null)).toBe('');
        });
    });

    describe('replaceMessageVariables', () => {
        it('replaces variables in string', () => {
            expect(replaceMessageVariables('Hello $name', { name: 'World' })).toBe('Hello World');
        });
        it('replaces multiple variables', () => {
            expect(replaceMessageVariables('Hi $a and $b', { a: 'X', b: 'Y' })).toBe('Hi X and Y');
        });
        it('does nothing if no variables match', () => {
            expect(replaceMessageVariables('Hello', { name: 'World' })).toBe('Hello');
        });
    });

    describe('extractAndJoinFields', () => {
        const data = [
            { a: '1', b: '2', c: '' },
            { a: '3', b: '', c: '4' }
        ];
        it('extracts and joins specified fields', () => {
            expect(extractAndJoinFields(data, ['a', 'b'])).toEqual(['1,2', '3']);
        });
        it('returns empty array if data is empty', () => {
            expect(extractAndJoinFields([], ['a'])).toEqual([]);
        });
        it('returns empty array if fieldsToExtract is empty', () => {
            expect(extractAndJoinFields(data, [])).toEqual([]);
        });
        it('uses custom splitter', () => {
            expect(extractAndJoinFields(data, ['a', 'b'], '|')).toEqual(['1|2', '3']);
        });
    });

    describe('toPascalCase', () => {
        it('converts kebab-case to PascalCase', () => {
            expect(toPascalCase('hello-world')).toBe('HelloWorld');
        });
        it('converts snake_case to PascalCase', () => {
            expect(toPascalCase('hello_world')).toBe('HelloWorld');
        });
        it('handles already PascalCase', () => {
            expect(toPascalCase('HelloWorld')).toBe('HelloWorld');
        });
    });

    describe('replaceErrorString', () => {
        it('replaces $item$ with replacement', () => {
            expect(replaceErrorString('Error: $item$ not found', 'File')).toBe('Error: File not found');
        });
        it('returns original if original or replacement is falsy', () => {
            expect(replaceErrorString('', 'File')).toBe('');
            expect(replaceErrorString('Error', '')).toBe('Error');
        });
        it('uses custom pattern', () => {
            expect(replaceErrorString('Hello %name%', 'World', /%name%/g)).toBe('Hello World');
        });
    });

    describe('isValidFileExtension', () => {
        it('returns true for valid file names', () => {
            expect(isValidFileExtension('file.txt')).toBe(true);
            expect(isValidFileExtension('archive.tar.gz')).toBe(true);
        });
        it('returns false for invalid file names', () => {
            expect(isValidFileExtension('file')).toBe(false);
            expect(isValidFileExtension('.hiddenfile')).toBe(false);
            expect(isValidFileExtension('')).toBe(false);
            expect(isValidFileExtension('   ')).toBe(false);
        });
    });

    describe('fileSizeFormatter', () => {
        it('formats bytes to KB', () => {
            expect(fileSizeFormatter(2048)).toBe('2.00 KB');
        });
        it('formats bytes to MB', () => {
            expect(fileSizeFormatter(1048576)).toBe('1.00 MB');
        });
        it('formats bytes to GB', () => {
            expect(fileSizeFormatter(1073741824)).toBe('1.00 GB');
        });
        it('formats bytes to TB', () => {
            expect(fileSizeFormatter(1099511627776)).toBe('1.00 TB');
        });
        it('returns 0 for 0 bytes', () => {
            expect(fileSizeFormatter(0)).toBe('0');
        });
    });

    describe('getFormatDateStr', () => {
        const date = new Date(2023, 4, 6, 7, 8, 9); // May 6, 2023, 07:08:09
        it('formats date as YYYYMMDD', () => {
            expect(getFormatDateStr(date)).toBe('20230506');
        });
        it('formats date as YYYYMMDDHHmmss', () => {
            expect(getFormatDateStr(date, 'YYYYMMDDHHmmss')).toBe('20230506070809');
        });
        it('returns empty string if date is falsy', () => {
            expect(getFormatDateStr(null)).toBe('');
        });
        it('defaults to YYYYMMDD for unknown format', () => {
            expect(getFormatDateStr(date, 'UNKNOWN')).toBe('20230506');
        });
    });
});