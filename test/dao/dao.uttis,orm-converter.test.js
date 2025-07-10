const { convertIdFields } = require('../../dao/utils/orm-converter');

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