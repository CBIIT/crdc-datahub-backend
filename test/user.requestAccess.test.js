const UserService = require('../services/user');
const { jest } = require('@jest/globals');

describe('UserService.requestAccess', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let mockContext, mockParams;

    // Mocks for constants and helpers
    const EN = {
        USER_ACCOUNT: { USER_REQUEST_ACCESS: 'USER_REQUEST_ACCESS' },
        SUBMISSION_REQUEST: {},
        DATA_SUBMISSION: {},
    };
    const ROLES = { ADMIN: 'ADMIN' };
    const USER_PERMISSION_CONSTANTS = { DATA_SUBMISSION: { REQUEST_ACCESS: 'REQUEST_ACCESS' } };
    const ERROR = {
        VERIFY: { INVALID_PERMISSION: 'INVALID_PERMISSION' },
        INVALID_APPROVED_STUDIES_ACCESS_REQUEST: 'INVALID_APPROVED_STUDIES_ACCESS_REQUEST',
        MAX_INSTITUTION_NAME_LIMIT: 'MAX_INSTITUTION_NAME_LIMIT',
        NO_ADMIN_USER: 'NO_ADMIN_USER',
        FAILED_TO_NOTIFY_ACCESS_REQUEST: 'FAILED_TO_NOTIFY_ACCESS_REQUEST',
    };
    const ValidationHandler = {
        handle: jest.fn((err) => ({ error: err })),
        success: jest.fn(() => ({ success: true })),
    };
    const replaceErrorString = (err, str) => `${err}:${str}`;
    const verifySession = jest.fn(() => ({
        verifyInitialized: jest.fn(),
    }));

    // Patch globals for the test
    global.EN = EN;
    global.ROLES = ROLES;
    global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;
    global.ERROR = ERROR;
    global.ValidationHandler = ValidationHandler;
    global.replaceErrorString = replaceErrorString;
    global.verifySession = verifySession;

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
            listApprovedStudiesByIDs: jest.fn(),
        };
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {
            getPermissionScope: jest.fn(),
        };

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

        // Patch private method
        userService.getUsersByNotifications = jest.fn();

        // Patch #getUserScope
        userService.#getUserScope = jest.fn();

        mockContext = {
            userInfo: {
                _id: 'user1',
                firstName: 'John',
                lastName: 'Doe',
                IDP: 'nih',
                email: 'john@nih.gov',
            }
        };

        mockParams = {
            studies: ['study1'],
            institutionName: 'NIH',
            role: 'SUBMITTER',
            additionalInfo: 'Some info'
        };
    });

    it('throws error if userScope is none', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => true
        });

        await expect(userService.requestAccess(mockParams, mockContext))
            .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('returns error if no approved studies', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => false
        });
        mockApprovedStudiesService.listApprovedStudiesByIDs.mockResolvedValue([]);
        mockParams.studies = ['study1'];

        const result = await userService.requestAccess(mockParams, mockContext);
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe(ERROR.INVALID_APPROVED_STUDIES_ACCESS_REQUEST);
    });

    it('returns error if institutionName is too long', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => false
        });
        mockApprovedStudiesService.listApprovedStudiesByIDs.mockResolvedValue([{ studyName: 'Study 1' }]);
        mockParams.institutionName = 'a'.repeat(101);

        const result = await userService.requestAccess(mockParams, mockContext);
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe(ERROR.MAX_INSTITUTION_NAME_LIMIT);
    });

    it('returns error if no admin emails found', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => false
        });
        mockApprovedStudiesService.listApprovedStudiesByIDs.mockResolvedValue([{ studyName: 'Study 1' }]);
        userService.getUsersByNotifications.mockResolvedValue([]);
        const result = await userService.requestAccess(mockParams, mockContext);
        expect(ValidationHandler.handle).toHaveBeenCalledWith(ERROR.NO_ADMIN_USER);
        expect(result).toEqual({ error: ERROR.NO_ADMIN_USER });
    });

    it('returns success if notification is accepted', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => false
        });
        mockApprovedStudiesService.listApprovedStudiesByIDs.mockResolvedValue([{ studyName: 'Study 1' }]);
        userService.getUsersByNotifications.mockResolvedValue([{ email: 'admin@nih.gov' }]);
        mockNotificationsService.requestUserAccessNotification.mockResolvedValue({ accepted: ['admin@nih.gov'] });

        const result = await userService.requestAccess(mockParams, mockContext);
        expect(ValidationHandler.success).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('returns error if notification is not accepted', async () => {
        userService.#getUserScope.mockResolvedValue({
            isNoneScope: () => false
        });
        mockApprovedStudiesService.listApprovedStudiesByIDs.mockResolvedValue([{ studyName: 'Study 1' }]);
        userService.getUsersByNotifications.mockResolvedValue([{ email: 'admin@nih.gov' }]);
        mockNotificationsService.requestUserAccessNotification.mockResolvedValue({ accepted: [] });

        const result = await userService.requestAccess(mockParams, mockContext);
        expect(result).toEqual({
            error: `${ERROR.FAILED_TO_NOTIFY_ACCESS_REQUEST}:userID:${mockContext.userInfo._id}`
        });
    });
});