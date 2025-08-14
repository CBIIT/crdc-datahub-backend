const { ConfigurationService } = require('../../services/configurationService');
const ERROR = require("../../constants/error-constants");

describe('ConfigurationService - getApplicationFormVersion', () => {
    let configurationService;
    let mockFindByType;

    beforeEach(() => {
        configurationService = new ConfigurationService();
        mockFindByType = jest
            .spyOn(configurationService.configurationDAO, 'findByType');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return the APPLICATION_FORM_VERSIONS when available', async () => {
        const mockConfig = { id: 'application123', type: 'APPLICATION_FORM_VERSIONS', current: '1.0', new: '1.0' };
        mockFindByType.mockResolvedValue(mockConfig);
        const result = await configurationService.getApplicationFormVersion({}, {});
        expect(mockFindByType).toHaveBeenCalled();
        expect(result).toEqual({ ...mockConfig, _id: mockConfig.id });
    });

    it('should throw APPLICATION_FORM_VERSIONS_NOT_FOUN error if APPLICATION_FORM_VERSIONS is not found', async () => {
        mockFindByType.mockResolvedValue(null);
        await expect(
            configurationService.getApplicationFormVersion({}, {})
        ).rejects.toThrow(ERROR.APPLICATION_FORM_VERSIONS_NOT_FOUND);
        expect(mockFindByType).toHaveBeenCalled();
    });
});