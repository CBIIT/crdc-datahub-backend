const { addChatbotEnabledConfig } = require('../../../documentation/3-6-0/add-chatbot-enabled-config');

describe('Add CHATBOT Configuration Migration', () => {
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
        mockConfigCollection.updateOne.mockResolvedValue({ upsertedCount: 1 });

        await addChatbotEnabledConfig(mockDb);

        expect(mockDb.collection).toHaveBeenCalledWith('configuration');
    });

    it('should upsert with setOnInsert when document is missing', async () => {
        mockConfigCollection.updateOne.mockResolvedValue({ upsertedCount: 1 });

        const result = await addChatbotEnabledConfig(mockDb);

        expect(mockConfigCollection.updateOne).toHaveBeenCalledWith(
            { type: 'CHATBOT' },
            {
                $setOnInsert: {
                    _id: 'f4a8c2d1-9e3b-4f6a-8c7d-1b2e3f4a5b6c',
                    type: 'CHATBOT',
                    keys: { enabled: false }
                }
            },
            { upsert: true }
        );
        expect(result).toEqual({ success: true, added: true });
    });

    it('should skip when configuration already exists', async () => {
        mockConfigCollection.updateOne.mockResolvedValue({ upsertedCount: 0 });

        const result = await addChatbotEnabledConfig(mockDb);

        expect(result).toEqual({ success: true, skipped: true });
    });

    it('should return success false on error', async () => {
        mockConfigCollection.updateOne.mockRejectedValue(new Error('db error'));

        const result = await addChatbotEnabledConfig(mockDb);

        expect(result).toEqual({ success: false, error: 'db error' });
    });
});
