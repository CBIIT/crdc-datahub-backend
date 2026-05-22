const { ConfigurationService } = require('../../services/configurationService');

describe('ConfigurationService.isChatBotEnabled', () => {
    let configurationService;

    beforeEach(() => {
        configurationService = new ConfigurationService();
        jest.spyOn(configurationService.configurationDAO, 'findByType').mockResolvedValue(null);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns true only when keys.enabled is strictly true', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue({
            keys: { enabled: true }
        });

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(true);
        expect(configurationService.configurationDAO.findByType).toHaveBeenCalledWith('CHATBOT');
    });

    it('returns false when configuration document is missing', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue(null);

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(false);
    });

    it('returns false when keys.enabled is false', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue({
            keys: { enabled: false }
        });

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(false);
    });

    it('returns false when keys.enabled is absent', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue({
            keys: {}
        });

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(false);
    });

    it('returns false for string "true" (non-strict boolean)', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue({
            keys: { enabled: 'true' }
        });

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(false);
    });

    it('returns false when keys is null', async () => {
        configurationService.configurationDAO.findByType.mockResolvedValue({
            keys: null
        });

        await expect(configurationService.isChatBotEnabled()).resolves.toBe(false);
    });
});
