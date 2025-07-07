const fs = require('fs');
const path = require('path');
const { arrayOfObjectsToTSV } = require('../../utility/io-util');

jest.mock('fs');

describe('arrayOfObjectsToTSV', () => {
    const filename = 'test.tsv';

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('writes correct TSV for a simple array of objects', () => {
        const data = [
            { a: 1, b: 'x' },
            { a: 2, b: 'y' }
        ];
        arrayOfObjectsToTSV(data, filename);

        const expectedTSV = 'a\tb\n1\tx\n2\ty';
        expect(fs.writeFileSync).toHaveBeenCalledWith(filename, expectedTSV, 'utf8');
    });

    it('handles null and undefined values', () => {
        const data = [
            { a: 1, b: null },
            { a: undefined, b: 'y' }
        ];
        arrayOfObjectsToTSV(data, filename);

        const expectedTSV = 'a\tb\n1\t\n\ty';
        expect(fs.writeFileSync).toHaveBeenCalledWith(filename, expectedTSV, 'utf8');
    });

    it('logs error and does not write file for empty array', () => {
        const originalConsoleError = console.error;
        console.error = jest.fn();
        arrayOfObjectsToTSV([], filename);
        expect(console.error).toHaveBeenCalledWith('Input must be a non-empty array');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        console.error = originalConsoleError;
    });

    it('logs error and does not write file for non-array input', () => {
        console.error = jest.fn();
        arrayOfObjectsToTSV(null, filename);
        expect(console.error).toHaveBeenCalledWith('Input must be a non-empty array');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('writes correct TSV for objects with extra keys (only first object keys used as headers)', () => {
        const data = [
            { a: 1, b: 2 },
            { a: 3, b: 4, c: 5 }
        ];
        arrayOfObjectsToTSV(data, filename);

        const expectedTSV = 'a\tb\n1\t2\n3\t4';
        expect(fs.writeFileSync).toHaveBeenCalledWith(filename, expectedTSV, 'utf8');
    });
});