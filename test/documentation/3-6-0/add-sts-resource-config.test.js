const { addStsResourceConfig } = require('../../../documentation/3-6-0/add-sts-resource-config');

describe('Add STS_RESOURCE Configuration Migration', () => {
    let mockDb;
    let mockConfigCollection;

    beforeEach(() => {
        jest.clearAllMocks();

        // Suppress console output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        mockConfigCollection = {
            findOne: jest.fn(),
            updateOne: jest.fn()
        };

        mockDb = {
            collection: jest.fn(() => mockConfigCollection)
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Database access', () => {
        it('should access the configuration collection', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });

            await addStsResourceConfig(mockDb);

            expect(mockDb.collection).toHaveBeenCalledWith('configuration');
        });
    });

    describe('Tier selection', () => {
        it('should use prod URLs when tier is prod', async () => {
            mockConfigCollection.findOne.mockResolvedValue({ keys: { tier: 'prod' } });
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            await addStsResourceConfig(mockDb);

            // The key update calls (2nd and 3rd) should use prod URLs
            const secondCall = mockConfigCollection.updateOne.mock.calls[1];
            expect(secondCall[1]).toEqual({
                $set: { 'keys.sts_api_all_url_v2': 'https://sts.cancer.gov/v2/terms/model-pvs' }
            });
            const thirdCall = mockConfigCollection.updateOne.mock.calls[2];
            expect(thirdCall[1]).toEqual({
                $set: { 'keys.sts_api_one_url_v2': 'https://sts.cancer.gov/v2/terms/model-pvs/{model}/{property}?version={version}' }
            });
        });

        it('should use non-prod URLs when tier is not prod', async () => {
            mockConfigCollection.findOne.mockResolvedValue({ keys: { tier: 'dev' } });
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            await addStsResourceConfig(mockDb);

            const secondCall = mockConfigCollection.updateOne.mock.calls[1];
            expect(secondCall[1]).toEqual({
                $set: { 'keys.sts_api_all_url_v2': 'https://sts-qa.cancer.gov/v2/terms/model-pvs' }
            });
            const thirdCall = mockConfigCollection.updateOne.mock.calls[2];
            expect(thirdCall[1]).toEqual({
                $set: { 'keys.sts_api_one_url_v2': 'https://sts-qa.cancer.gov/v2/terms/model-pvs/{model}/{property}?version={version}' }
            });
        });

        it('should default to non-prod URLs when TIER document is missing', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            await addStsResourceConfig(mockDb);

            const secondCall = mockConfigCollection.updateOne.mock.calls[1];
            expect(secondCall[1]).toEqual({
                $set: { 'keys.sts_api_all_url_v2': 'https://sts-qa.cancer.gov/v2/terms/model-pvs' }
            });
        });
    });

    describe('Insert path (no existing STS_RESOURCE)', () => {
        it('should upsert a new document and add all keys', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            const result = await addStsResourceConfig(mockDb);

            // Verify the upsert call
            expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
                { type: 'STS_RESOURCE' },
                { $setOnInsert: { _id: '1ef37619-4225-46bd-b773-4f2b1ec63000', type: 'STS_RESOURCE' } },
                { upsert: true }
            );
            expect(result).toEqual({ success: true, added: true });
        });

        it('should call updateOne for each key with the $eq: null filter', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            await addStsResourceConfig(mockDb);

            // 3 updateOne calls total: 1 upsert + 2 key updates
            expect(mockConfigCollection.updateOne).toHaveBeenCalledTimes(3);

            expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
                { type: 'STS_RESOURCE', 'keys.sts_api_all_url_v2': { $eq: null } },
                { $set: { 'keys.sts_api_all_url_v2': expect.any(String) } }
            );
            expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
                { type: 'STS_RESOURCE', 'keys.sts_api_one_url_v2': { $eq: null } },
                { $set: { 'keys.sts_api_one_url_v2': expect.any(String) } }
            );
        });
    });

    describe('Update path (existing STS_RESOURCE with missing keys)', () => {
        it('should return updated when existing doc is missing keys that get added', async () => {
            mockConfigCollection.findOne.mockResolvedValue({ keys: { tier: 'dev' } });
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 }) // upsert no-op
                .mockResolvedValueOnce({ modifiedCount: 1 }) // sts_api_all_url_v2 was missing
                .mockResolvedValueOnce({ modifiedCount: 0 }); // sts_api_one_url_v2 already present

            const result = await addStsResourceConfig(mockDb);

            expect(result).toEqual({ success: true, updated: true });
        });

        it('should return updated when both keys are missing and get added', async () => {
            mockConfigCollection.findOne.mockResolvedValue({ keys: { tier: 'dev' } });
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 })
                .mockResolvedValueOnce({ modifiedCount: 1 })
                .mockResolvedValueOnce({ modifiedCount: 1 });

            const result = await addStsResourceConfig(mockDb);

            expect(result).toEqual({ success: true, updated: true });
        });
    });

    describe('Skip path (all keys present)', () => {
        it('should return skipped when existing doc already has all keys', async () => {
            mockConfigCollection.findOne.mockResolvedValue({ keys: { tier: 'dev' } });
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 0 }) // upsert no-op
                .mockResolvedValueOnce({ modifiedCount: 0 }) // key already exists
                .mockResolvedValueOnce({ modifiedCount: 0 }); // key already exists

            const result = await addStsResourceConfig(mockDb);

            expect(result).toEqual({ success: true, skipped: true });
        });
    });

    describe('Error handling', () => {
        it('should return failure when findOne throws', async () => {
            mockConfigCollection.findOne.mockRejectedValue(new Error('Connection lost'));

            const result = await addStsResourceConfig(mockDb);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection lost');
        });

        it('should return failure when the upsert updateOne throws', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne.mockRejectedValue(new Error('Write concern error'));

            const result = await addStsResourceConfig(mockDb);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Write concern error');
        });

        it('should return failure when a key update updateOne throws', async () => {
            mockConfigCollection.findOne.mockResolvedValue(null);
            mockConfigCollection.updateOne
                .mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 })
                .mockRejectedValueOnce(new Error('Key update failed'));

            const result = await addStsResourceConfig(mockDb);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Key update failed');
        });
    });
});
