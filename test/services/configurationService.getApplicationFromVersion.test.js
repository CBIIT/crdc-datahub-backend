const { ConfigurationService } = require('../../services/configurationService');

describe('ConfigurationService - getApplicationFromVersion', () => {
    let configurationService;
    let mockFindByType;

    beforeEach(() => {
        configurationService = new ConfigurationService();
        mockFindByTyp = jest
            .spyOn(configurationService.configurationDAO, 'findByType');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return the APPLICATION_FORM_VERSIONS when available', async () => {
        const mockConfig = { id: 'application123', type: 'APPLICATION_FORM_VERSIONS', current: '1.0', new: '1.0' };
        mockGetApplicationFromVersion.mockResolvedValue(mockConfig);
        const result = await configurationService.getApplicationFromVersion({}, {});
        expect(result).toBe(mockConfig);
        expect(mockFindByType).toHaveBeenCalled();
    });

    it('should return null if no CLI uploader version is available', async () => {
        mockGetCurrentCLIUploaderVersion.mockResolvedValue(null);
        const result = await configurationService.retrieveCLIUploaderVersion({}, {});
        expect(result).toBeNull();
        expect(mockGetCurrentCLIUploaderVersion).toHaveBeenCalled();
    });
});