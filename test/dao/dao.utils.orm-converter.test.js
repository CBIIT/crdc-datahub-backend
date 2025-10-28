const { convertIdFields, convertMongoFilterToPrismaFilter } = require('../../dao/utils/orm-converter');

describe('convertIdFields', () => {
    it('should convert a single object with _id to id', () => {
        const input = { _id: '123', name: 'Alice' };
        const expected = { id: '123', name: 'Alice' };
        expect(convertIdFields(input)).toEqual(expected);
    });

    it('should convert nested _id fields', () => {
        const input = { _id: '1', child: { _id: '2', value: 42 } };
        const expected = { id: '1', child: { id: '2', value: 42 } };
        expect(convertIdFields(input)).toEqual(expected);
    });

    it('should convert _id fields in arrays', () => {
        const input = [{ _id: 'a' }, { _id: 'b', foo: 'bar' }];
        const expected = [{ id: 'a' }, { id: 'b', foo: 'bar' }];
        expect(convertIdFields(input)).toEqual(expected);
    });

    it('should preserve Date objects', () => {
        const date = new Date();
        const input = { _id: 'x', createdAt: date };
        const result = convertIdFields(input);
        expect(result.createdAt).toBe(date);
    });

    it('should handle deeply nested arrays and objects', () => {
        const input = {
            _id: 'root',
            arr: [
                { _id: 'a1', nested: [{ _id: 'b1' }, { _id: 'b2' }] },
                { _id: 'a2' }
            ]
        };
        const expected = {
            id: 'root',
            arr: [
                { id: 'a1', nested: [{ id: 'b1' }, { id: 'b2' }] },
                { id: 'a2' }
            ]
        };
        expect(convertIdFields(input)).toEqual(expected);
    });

    it('should return primitives as is', () => {
        expect(convertIdFields(42)).toBe(42);
        expect(convertIdFields('hello')).toBe('hello');
        expect(convertIdFields(null)).toBe(null);
        expect(convertIdFields(undefined)).toBe(undefined);
    });

    it('should handle empty objects and arrays', () => {
        expect(convertIdFields({})).toEqual({});
        expect(convertIdFields([])).toEqual([]);
    });
});

describe('convertMongoFilterToPrismaFilter', () => {
    it('should convert _id fields to id fields', () => {
        const input = { _id: { $in: ['123', '456'] } };
        const expected = { id: { in: ['123', '456'] } };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });

    it('should convert nested _id fields', () => {
        const input = { 
            _id: { $in: ['123'] },
            parent: { _id: { $eq: '789' } }
        };
        const expected = { 
            id: { in: ['123'] },
            parent: { id: { equals: '789' } }
        };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });

    it('should handle regular MongoDB operators without _id', () => {
        const input = { name: { $eq: 'test' }, age: { $gt: 18 } };
        const expected = { name: { equals: 'test' }, age: { gt: 18 } };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });

    it('should handle $in with single element array', () => {
        const input = { _id: { $in: ['app1'] } };
        const expected = { id: { in: ['app1'] } };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });

    it('should handle $in with multiple element array', () => {
        const input = { _id: { $in: ['app1', 'app2'] } };
        const expected = { id: { in: ['app1', 'app2'] } };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });

    it('should handle in with multiple element array', () => {
        const input = { id: { in: ['app1', 'app2'] } };
        const expected = { id: { in: ['app1', 'app2'] } };
        expect(convertMongoFilterToPrismaFilter(input)).toEqual(expected);
    });
});

describe('tryConvertDate', () => {
    const { tryConvertDate } = require('../../dao/utils/orm-converter');
    
    describe('should convert valid ISO format strings', () => {
        it('should convert ISO 8601 format', () => {
            const input = '2023-12-25T10:30:00.000Z';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.toISOString()).toBe(input);
        });

        it('should convert ISO date format', () => {
            const input = '2023-12-25';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(11); // December is 11 (0-indexed)
            // Note: getUTCDate() ensures consistent results regardless of timezone
            expect(result.getUTCDate()).toBe(25);
        });

        it('should convert ISO 8601 without milliseconds', () => {
            const input = '2023-12-25T10:30:00Z';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
            // Validate the UTC hour directly to ensure correctness
            expect(result.getUTCHours()).toBe(10); // The original time is 10:30 UTC
            expect(result.getMinutes()).toBe(30);
        });

        it('should convert ISO 8601 without Z suffix', () => {
            const input = '2023-12-25T10:30:00.000';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
        });

        it('should convert ISO 8601 with positive timezone offset', () => {
            const input = '2023-12-25T10:30:00.000+05:30';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(11); // December is 11 (0-indexed)
        });

        it('should convert ISO 8601 with negative timezone offset', () => {
            const input = '2023-12-25T10:30:00.000-08:00';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(11); // December is 11 (0-indexed)
        });

        it('should convert ISO 8601 with timezone offset without milliseconds', () => {
            const input = '2023-12-25T10:30:00+05:30';
            const result = tryConvertDate(input);
            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2023);
        });
    });

    describe('should NOT convert non-ISO format strings', () => {
        it('should not convert short strings', () => {
            expect(tryConvertDate('123')).toBe('123');
            expect(tryConvertDate('abc')).toBe('abc');
        });

        it('should not convert UUIDs', () => {
            const uuid = 'ba4a581f-4666-4c8f-911e-89d7e405bdca';
            expect(tryConvertDate(uuid)).toBe(uuid);
        });

        it('should not convert MongoDB ObjectIds', () => {
            const objectId = '507f1f77bcf86cd799439011';
            expect(tryConvertDate(objectId)).toBe(objectId);
        });

        it('should not convert pure numeric strings', () => {
            expect(tryConvertDate('123456789')).toBe('123456789');
            expect(tryConvertDate('999999999')).toBe('999999999');
        });

        it('should not convert strings that look like IDs', () => {
            expect(tryConvertDate('user123')).toBe('user123');
            expect(tryConvertDate('test-id-456')).toBe('test-id-456');
        });

        it('should not convert non-ISO date formats', () => {
            expect(tryConvertDate('12/25/2023')).toBe('12/25/2023');
            expect(tryConvertDate('25-12-2023')).toBe('25-12-2023');
            expect(tryConvertDate('2023/12/25')).toBe('2023/12/25');
        });

        it('should not convert invalid date strings', () => {
            expect(tryConvertDate('2023-13-45')).toBe('2023-13-45'); // Invalid month/day
            expect(tryConvertDate('not-a-date')).toBe('not-a-date');
        });
    });

    describe('should handle edge cases', () => {
        it('should return non-strings as-is', () => {
            expect(tryConvertDate(123)).toBe(123);
            expect(tryConvertDate(null)).toBe(null);
            expect(tryConvertDate(undefined)).toBe(undefined);
            expect(tryConvertDate({})).toEqual({});
            expect(tryConvertDate([])).toEqual([]);
        });

        it('should handle empty string', () => {
            expect(tryConvertDate('')).toBe('');
        });
    });
});