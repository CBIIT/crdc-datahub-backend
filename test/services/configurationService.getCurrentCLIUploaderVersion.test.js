const { ConfigurationService } = require('../../services/configurationService');

describe('ConfigurationService - retrieveCLIUploaderVersion', () => {
    let configurationService;
    let mockGetCurrentCLIUploaderVersion;

    beforeEach(() => {
        configurationService = new ConfigurationService();
        mockGetCurrentCLIUploaderVersion = jest
            .spyOn(configurationService, 'getCurrentCLIUploaderVersion');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return the current CLI uploader version when available', async () => {
        mockGetCurrentCLIUploaderVersion.mockResolvedValue('1.2.3');
        const result = await configurationService.retrieveCLIUploaderVersion({}, {});
        expect(result).toBe('1.2.3');
        expect(mockGetCurrentCLIUploaderVersion).toHaveBeenCalled();
    });

    it('should return null if no CLI uploader version is available', async () => {
        mockGetCurrentCLIUploaderVersion.mockResolvedValue(null);
        const result = await configurationService.retrieveCLIUploaderVersion({}, {});
        expect(result).toBeNull();
        expect(mockGetCurrentCLIUploaderVersion).toHaveBeenCalled();
    });
});