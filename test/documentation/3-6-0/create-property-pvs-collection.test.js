const { createPropertyPVsCollection } = require('../../../documentation/3-6-0/create-property-pvs-collection');

describe('Create propertyPVs collection migration', () => {
    let mockDb;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        mockDb = {
            createCollection: jest.fn()
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should create collection and return created: true', async () => {
        mockDb.createCollection.mockResolvedValue(undefined);

        const result = await createPropertyPVsCollection(mockDb);

        expect(mockDb.createCollection).toHaveBeenCalledWith('propertyPVs');
        expect(result).toEqual({ success: true, created: true });
    });

    it('should return skipped: true when collection already exists (code 48)', async () => {
        const err = new Error('namespace exists');
        err.code = 48;
        mockDb.createCollection.mockRejectedValue(err);

        const result = await createPropertyPVsCollection(mockDb);

        expect(result).toEqual({ success: true, skipped: true });
    });

    it('should return success: false on other errors', async () => {
        mockDb.createCollection.mockRejectedValue(new Error('connection failed'));

        const result = await createPropertyPVsCollection(mockDb);

        expect(result).toEqual({ success: false, error: 'connection failed' });
    });
});
