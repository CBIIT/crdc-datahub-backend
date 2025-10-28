const { DashboardService } = require('../../services/dashboardService');
const ERROR = require('../../constants/error-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { verifySession } = require('../../verifier/user-info-verifier');

jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn()
}));

describe('DashboardService.getDashboardURL', () => {
    let dashboardService;
    let mockUserService, mockAwsService, mockConfigurationService, mockAuthorizationService;
    let mockContext, mockParams;

    beforeEach(() => {
        mockUserService = {};
        mockAwsService = {
            getQuickInsightURL: jest.fn()
        };
        mockConfigurationService = {
            findByType: jest.fn()
        };
        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };
        dashboardService = new DashboardService(
            mockUserService,
            mockAwsService,
            mockConfigurationService,
            { sessionTimeout: 1234 },
            mockAuthorizationService
        );

        mockContext = { userInfo: { id: 'user1' } };
        mockParams = { type: 'SOME_TYPE' };

        // Mock verifySession().verifyInitialized()
        const verifyInitialized = jest.fn();
        verifySession.mockReturnValue({ verifyInitialized });
        verifyInitialized.mockReturnValue();
    });

    it('should return dashboard URL and expiresIn on success', async () => {
        // Mock userScope
        const userScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
            isAllScope: jest.fn().mockReturnValue(true),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false)
        };
        // Mock UserScope.create
        jest.spyOn(require('../../domain/user-scope').UserScope, 'create').mockReturnValue(userScope);

        mockAuthorizationService.getPermissionScope.mockResolvedValue(['all']);
        mockConfigurationService.findByType.mockResolvedValue({ dashboardID: 'DASH_ID' });
        mockAwsService.getQuickInsightURL.mockResolvedValue('https://dashboard.url');

        const result = await dashboardService.getDashboardURL(mockParams, mockContext);

        expect(result).toEqual({
            url: 'https://dashboard.url',
            expiresIn: 1234
        });
        expect(mockAwsService.getQuickInsightURL).toHaveBeenCalledWith('DASH_ID', 1234);
    });

    it('should throw INVALID_PERMISSION if userScope is none', async () => {
        const userScope = {
            isNoneScope: jest.fn().mockReturnValue(true),
            isAllScope: jest.fn().mockReturnValue(false),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false)
        };
        jest.spyOn(require('../../domain/user-scope').UserScope, 'create').mockReturnValue(userScope);

        mockAuthorizationService.getPermissionScope.mockResolvedValue([]);
        await expect(dashboardService.getDashboardURL(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('should throw NO_VALID_DASHBOARD_TYPE if dashboardID is missing', async () => {
        const userScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
            isAllScope: jest.fn().mockReturnValue(true),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false)
        };
        jest.spyOn(require('../../domain/user-scope').UserScope, 'create').mockReturnValue(userScope);

        mockAuthorizationService.getPermissionScope.mockResolvedValue(['all']);
        mockConfigurationService.findByType.mockResolvedValue({}); // dashboardID missing

        await expect(dashboardService.getDashboardURL(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.NO_VALID_DASHBOARD_TYPE);
    });

    it('should call verifySession and verifyInitialized', async () => {
        const verifyInitialized = jest.fn();
        verifySession.mockReturnValue({ verifyInitialized });
        const userScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
            isAllScope: jest.fn().mockReturnValue(true),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false)
        };
        jest.spyOn(require('../../domain/user-scope').UserScope, 'create').mockReturnValue(userScope);

        mockAuthorizationService.getPermissionScope.mockResolvedValue(['all']);
        mockConfigurationService.findByType.mockResolvedValue({ dashboardID: 'DASH_ID' });
        mockAwsService.getQuickInsightURL.mockResolvedValue('https://dashboard.url');

        await dashboardService.getDashboardURL(mockParams, mockContext);

        expect(verifySession).toHaveBeenCalledWith(mockContext);
        expect(verifyInitialized).toHaveBeenCalled();
    });
});