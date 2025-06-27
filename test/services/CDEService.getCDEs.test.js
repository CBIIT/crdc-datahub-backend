const { CDE } = require('../../services/CDEService');

describe('CDE.getCDEs', () => {
    let cdeService;
    let mockGetCdeByCodeAndVersion;

    beforeEach(() => {
        cdeService = new CDE();
        mockGetCdeByCodeAndVersion = jest.fn();
        cdeService.cdeDAO.getCdeByCodeAndVersion = mockGetCdeByCodeAndVersion;
    });

    it('should return [] if params is undefined', async () => {
        const result = await cdeService.getCDEs(undefined);
        expect(result).toEqual([]);
        expect(mockGetCdeByCodeAndVersion).not.toHaveBeenCalled();
    });

    it('should return [] if params.CDEInfo is undefined', async () => {
        const result = await cdeService.getCDEs({});
        expect(result).toEqual([]);
        expect(mockGetCdeByCodeAndVersion).not.toHaveBeenCalled();
    });

    it('should return [] if params.CDEInfo is not an array', async () => {
        const result = await cdeService.getCDEs({ CDEInfo: 'not-an-array' });
        expect(result).toEqual([]);
        expect(mockGetCdeByCodeAndVersion).not.toHaveBeenCalled();
    });

    it('should return [] if params.CDEInfo is an empty array', async () => {
        const result = await cdeService.getCDEs({ CDEInfo: [] });
        expect(result).toEqual([]);
        expect(mockGetCdeByCodeAndVersion).not.toHaveBeenCalled();
    });

    it('should call getCdeByCodeAndVersion with correct conditions (with and without CDEVersion)', async () => {
        const params = {
            CDEInfo: [
                { CDECode: 'A', CDEVersion: '1' },
                { CDECode: 'B' },
                { CDECode: 'C', CDEVersion: '2' }
            ]
        };
        const expectedConditions = [
            { CDECode: 'A', CDEVersion: '1' },
            { CDECode: 'C', CDEVersion: '2' },
            { CDECode: 'B' }
        ];
        const fakeResult = [{ foo: 'bar' }];
        mockGetCdeByCodeAndVersion.mockResolvedValue(fakeResult);

        const result = await cdeService.getCDEs(params);

        expect(mockGetCdeByCodeAndVersion).toHaveBeenCalledWith(expectedConditions);
        expect(result).toBe(fakeResult);
    });

    it('should handle only CDEVersion present', async () => {
        const params = {
            CDEInfo: [
                { CDECode: 'A', CDEVersion: '1' },
                { CDECode: 'B', CDEVersion: '2' }
            ]
        };
        const expectedConditions = [
            { CDECode: 'A', CDEVersion: '1' },
            { CDECode: 'B', CDEVersion: '2' }
        ];
        mockGetCdeByCodeAndVersion.mockResolvedValue(['result']);

        const result = await cdeService.getCDEs(params);

        expect(mockGetCdeByCodeAndVersion).toHaveBeenCalledWith(expectedConditions);
        expect(result).toEqual(['result']);
    });

    it('should handle only CDECode present (no CDEVersion)', async () => {
        const params = {
            CDEInfo: [
                { CDECode: 'A' },
                { CDECode: 'B' }
            ]
        };
        const expectedConditions = [
            { CDECode: 'A' },
            { CDECode: 'B' }
        ];
        mockGetCdeByCodeAndVersion.mockResolvedValue(['result2']);

        const result = await cdeService.getCDEs(params);

        expect(mockGetCdeByCodeAndVersion).toHaveBeenCalledWith(expectedConditions);
        expect(result).toEqual(['result2']);
    });
});