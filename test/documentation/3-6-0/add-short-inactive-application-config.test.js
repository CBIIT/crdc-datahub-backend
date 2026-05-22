const { addShortInactiveApplicationConfig } = require('../../../documentation/3-6-0/add-short-inactive-application-config');

describe('Add Short Inactive Application Configuration Migration', () => {
    let mockDb;
    let mockConfigCollection;

    beforeEach(() => {
        jest.clearAllMocks();

        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        mockConfigCollection = {
            updateOne: jest.fn()
        };

        mockDb = {
            collection: jest.fn(() => mockConfigCollection)
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should access the configuration collection', async () => {
        mockConfigCollection.updateOne.mockResolvedValue({ upsertedCount: 0, modifiedCount: 1 });

        await addShortInactiveApplicationConfig(mockDb);

        expect(mockDb.collection).toHaveBeenCalledWith('configuration');
    });

    it('should upsert SCHEDULED_JOBS document if missing', async () => {
        mockConfigCollection.updateOne
            .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 }) // upsert
            .mockResolvedValueOnce({ modifiedCount: 1 }); // set key

        const result = await addShortInactiveApplicationConfig(mockDb);

        expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
            { type: 'SCHEDULED_JOBS' },
            { $setOnInsert: { _id: expect.any(String), type: 'SCHEDULED_JOBS' } },
            { upsert: true }
        );
        expect(result).toEqual({ success: true, added: true });
    });

    it('should add INACTIVE_NEW_APPLICATION_DAYS key with default value 30', async () => {
        mockConfigCollection.updateOne
            .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 }) // upsert no-op
            .mockResolvedValueOnce({ modifiedCount: 1 }); // key added

        await addShortInactiveApplicationConfig(mockDb);

        expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
            { type: 'SCHEDULED_JOBS', 'INACTIVE_NEW_APPLICATION_DAYS': { $eq: null } },
            { $set: { 'INACTIVE_NEW_APPLICATION_DAYS': 30 } }
        );
    });

    it('should skip when configuration already has the key', async () => {
        mockConfigCollection.updateOne
            .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 }) // upsert no-op
            .mockResolvedValueOnce({ modifiedCount: 0 }); // key already exists

        const result = await addShortInactiveApplicationConfig(mockDb);

        expect(result).toEqual({ success: true, skipped: true });
    });

    it('should return success false on error', async () => {
        mockConfigCollection.updateOne.mockRejectedValue(new Error('db error'));

        const result = await addShortInactiveApplicationConfig(mockDb);

        expect(result).toEqual({ success: false, error: 'db error' });
    });

    it('should return success true and added when key is newly added', async () => {
        mockConfigCollection.updateOne
            .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 })
            .mockResolvedValueOnce({ modifiedCount: 1 });

        const result = await addShortInactiveApplicationConfig(mockDb);

        expect(result.success).toBe(true);
        expect(result.added).toBe(true);
    });
});
