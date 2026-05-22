const { UserService } = require('../../services/user');
const ERROR = require('../../constants/error-constants');

describe('UserService.requestAccess', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    // Mocked dependencies and constants
    const EN = {
        USER_ACCOUNT: { USER_REQUEST_ACCESS: 'USER_REQUEST_ACCESS' },
        SUBMISSION_REQUEST: {},
        DATA_SUBMISSION: {},
    };
    const ROLES = { ADMIN: 'ADMIN' };
    const USER_PERMISSION_CONSTANTS = { DATA_SUBMISSION: { REQUEST_ACCESS: 'REQUEST_ACCESS' } };
    const ValidationHandler = {
        handle: jest.fn((err) => ({ error: err })),
        success: jest.fn(() => ({ success: true })),
    };
    const replaceErrorString = (err, str) => `${err}:${str}`;

    beforeEach(() => {
        mockUserCollection = {};
        mockLogCollection = {};
        mockOrganizationCollection = {};
        mockNotificationsService = {
            requestUserAccessNotification: jest.fn(),
        };
        mockSubmissionsCollection = {};
        mockApplicationCollection = {};
        mockApprovedStudiesService = { 
            listApprovedStudies: jest.fn().mockResolvedValue([]),
            approvedStudiesCollection: {},
            listApprovedStudiesByIDs: jest.fn().mockResolvedValue([]) // Add this if needed
        };
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {
            getPermissionScope: jest.fn(),
        };

        // Don't mock requestAccess since we want to test actual implementation
        userService = new UserService(
            mockUserCollection,
            mockLogCollection,
            mockOrganizationCollection,
            mockNotificationsService,
            mockSubmissionsCollection,
            mockApplicationCollection,
            'official@email.com',
            'http://app.url',
            mockApprovedStudiesService,
            30,
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );

        // Patch constants and helpers onto the instance
        userService._allEmailNotificationNamesSet = new Set([EN.USER_ACCOUNT.USER_REQUEST_ACCESS]);
        global.EN = EN;
        global.ROLES = ROLES;
        global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;
        global.ERROR = ERROR;
        global.ValidationHandler = ValidationHandler;
        global.replaceErrorString = replaceErrorString;

        // Patch verifySession
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn(),
        }));

        // Mock required methods
        userService.getUsersByNotifications = jest.fn();
        userService._getUserScope = jest.fn();

        context = {
            userInfo: {
                _id: 'user1',
                firstName: 'John',
                lastName: 'Doe',
                IDP: 'NIH',
                email: 'john@example.com',
            }
        };

        params = {
            studies: ['study1'],
            institutionName: 'Test Institution',
            role: 'SUBMITTER',
            additionalInfo: 'Some info'
        };
    });

    it('returns error if no approved studies', async () => {
        // Setup
        userService._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        mockApprovedStudiesService.listApprovedStudies.mockResolvedValue([]);
        
        const params = { studies: ['study1'], institutionName: 'Test' };
        const context = { 
            userInfo: { 
                _id: 'user1',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com'
            }
        };

        // Since the method returns an Error object rather than throwing it
        const result = await userService.requestAccess(params, context);
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe(ERROR.INVALID_APPROVED_STUDIES_ACCESS_REQUEST);
    });

    it('returns error if an approved study is not Active', async () => {
        userService._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        mockApprovedStudiesService.listApprovedStudies.mockResolvedValue([
            { _id: 'study1', studyName: 'S1', status: 'Inactive' },
        ]);

        const result = await userService.requestAccess(params, context);
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe(ERROR.INVALID_APPROVED_STUDIES_ACCESS_INACTIVE);
    });
});
