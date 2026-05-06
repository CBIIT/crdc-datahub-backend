const { Application, VALID_ORDER_BY_LIST_APPLICATIONS } = require('../../services/application');
const ApplicationDAO = require('../../dao/application');
const USER_PERMISSION_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");
const ERROR = require('../../constants/error-constants');
const { NEW, APPROVED, IN_PROGRESS, INQUIRED, CANCELED, REJECTED, DELETED, SUBMITTED, IN_REVIEW } = require('../../constants/application-constants');

// Mock ApplicationDAO
jest.mock('../../dao/application');

// Mocks for dependencies
const mockLogCollection = { insert: jest.fn() };
const mockApplicationCollection = {
    find: jest.fn(),
    insert: jest.fn(),
    aggregate: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    distinct: jest.fn()
};
const mockApprovedStudiesService = { findByStudyName: jest.fn(), storeApprovedStudies: jest.fn() };
const mockUserService = {
    userCollection: { find: jest.fn(), aggregate: jest.fn() },
    getUsersByNotifications: jest.fn(),
    getUserByID: jest.fn(),
    updateUserInfo: jest.fn()
};
const mockDbService = { updateOne: jest.fn(), updateMany: jest.fn() };
const mockNotificationsService = {
    approveQuestionNotification: jest.fn(),
    cancelApplicationNotification: jest.fn(),
    restoreApplicationNotification: jest.fn(),
    finalRemindApplicationsNotification: jest.fn(),
    remindApplicationsNotification: jest.fn(),
    multipleChangesApproveQuestionNotification: jest.fn(),
    dbGapMissingApproveQuestionNotification: jest.fn(),
    dataModelChangeApproveQuestionNotification: jest.fn(),
    pendingGPANotification: jest.fn(),
    pendingImageDeIdentificationApproveQuestionNotification: jest.fn(),
    inquireQuestionNotification: jest.fn()
};
const mockEmailParams = { inactiveDays: 180, inactiveApplicationNotifyDays: [7, 30, 60], conditionalSubmissionContact: 'contact@email', url: 'http://test', submissionGuideURL: 'http://guide' };
const mockOrganizationService = {
    findOneByProgramName: jest.fn().mockResolvedValue(null),
    upsertByProgramName: jest.fn(),
    getOrganizationByID: jest.fn(),
    organizationCollection: { update: jest.fn() }
};
const mockInstitutionService = { addNewInstitutions: jest.fn() };
const mockConfigurationService = { findByType: jest.fn() };
const mockAuthorizationService = { getPermissionScope: jest.fn() };

// Mocked constants and helpers
global.APPLICATION = 'Application';
global.USER_PERMISSION_CONSTANTS = {
    SUBMISSION_REQUEST: {
        VIEW: 'VIEW',
        CREATE: 'CREATE',
        SUBMIT: 'SUBMIT',
        CANCEL: 'CANCEL',
        REVIEW: 'REVIEW'
    }
};
global.HistoryEventBuilder = { createEvent: jest.fn(() => ({ dateTime: Date.now() })) };
global.UpdateApplicationStateEvent = { create: jest.fn(), createByApp: jest.fn() };
global.CreateApplicationEvent = { create: jest.fn() };
global.verifySession = jest.fn(() => ({ verifyInitialized: jest.fn() }));
global.verifyApplication = jest.fn(() => ({
    notEmpty: jest.fn().mockReturnThis(),
    state: jest.fn().mockReturnThis(),
    isUndefined: jest.fn().mockReturnThis()
}));
global.replaceErrorString = (err, val) => err + val;
global.UserScope = { create: jest.fn() };
global.isTrue = v => !!v;
global.isUndefined = v => v === undefined;
global.getCurrentTime = () => 1234567890;
global.v4 = jest.fn(() => 'uuid');
global.formatName = user => `${user.firstName} ${user.lastName}`;
global.updateApplication = jest.fn((col, app) => app);
global.logStateChange = jest.fn();
global.getApplicationQuestionnaire = jest.fn(() => ({ accessTypes: [], study: {} }));
global.sendEmails = {
    submitApplication: jest.fn(),
    rejectApplication: jest.fn(),
    inquireApplication: jest.fn(),
    inactiveApplications: jest.fn()
};
global.getCCEmails = jest.fn(() => []);
global.getUserEmails = jest.fn(() => []);
global.setDefaultIfNoName = jest.fn(name => name || 'NA');
global.EMAIL_NOTIFICATIONS = {
    SUBMISSION_REQUEST: {
        REQUEST_DELETE: 'REQUEST_DELETE',
        REQUEST_REVIEW: 'REQUEST_REVIEW',
        REQUEST_CANCEL: 'REQUEST_CANCEL',
        REQUEST_EXPIRING: 'REQUEST_EXPIRING'
    }
};
global.ROLES = {
    FEDERAL_LEAD: 'Federal Lead',
    DATA_COMMONS_PERSONNEL: 'Data Commons Personnel',
    ADMIN: 'Admin'
};
global.MongoPagination = jest.fn().mockImplementation(() => ({
    getPaginationPipeline: () => [],
    getNoLimitPipeline: () => []
}));
global.subtractDaysFromNow = jest.fn(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 181));
global.logDaysDifference = jest.fn();

describe('Application', () => {
    let app;
    let context;
    let userScopeMock;

    beforeEach(() => {
        jest.clearAllMocks();
        userScopeMock = {
            isNoneScope: jest.fn(() => false),
            isAllScope: jest.fn(() => true),
            isOwnScope: jest.fn(() => false)
        };
        UserScope.create.mockReturnValue(userScopeMock);
        mockAuthorizationService.getPermissionScope.mockResolvedValue(['all']);
        app = new Application(
            mockLogCollection,
            mockApplicationCollection,
            mockApprovedStudiesService,
            mockUserService,
            mockDbService,
            mockNotificationsService,
            mockEmailParams,
            mockOrganizationService,
            mockInstitutionService,
            mockConfigurationService,
            mockAuthorizationService
        );

        appService = new Application(
            mockLogCollection,
            {}, // applicationCollection (unused)
            mockApprovedStudiesService,
            mockUserService,
            mockDbService,
            mockNotificationsService,
            { inactiveDays: 180, inactiveApplicationNotifyDays: [7, 30], url: 'http://test', conditionalSubmissionContact: 'help@test.com' },
            mockOrganizationService,
            mockInstitutionService,
            mockConfigurationService,
            mockAuthorizationService
        );

        context = {
            userInfo: {
                _id: 'user1', firstName: 'John', lastName: 'Doe', email: 'john@doe.com', organization: { orgID: 'org1', orgName: 'Org' },
                role: ROLES.ADMIN, notifications: [USER_PERMISSION_CONSTANTS.EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW], permissions: ["dashboard:view",
                    "user:manage:all",
                    "submission_request:view",
                    "submission_request:review",
                    "submission_request:create",
                    "submission_request:submit",
                    "program:manage:all",
                    "study:manage:all",
                    "data_submission:view",
                    "data_submission:create",
                    "data_submission:confirm",
                    "access:request"]
            }
        };
    });

    describe('getApplication', () => {
        it('should return application with upgraded version', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            userScopeMock.isOwnScope.mockReturnValue(false);
            UserScope.create.mockReturnValue(userScopeMock);

            // Mock getApplicationById to return an application with APPROVED status and version '2.0'
            app.getApplicationById = jest.fn().mockResolvedValue({ _id: 'app1', status: APPROVED, version: '2.0' });
            // Mock _checkConditionalApproval to do nothing
            app._checkConditionalApproval = jest.fn().mockResolvedValue(undefined);
            // Mock _getApplicationVersionByStatus to return '2.0'
            app._getApplicationVersionByStatus = jest.fn().mockResolvedValue('2.0');

            await expect(app.getApplication({ _id: 'app1' }, context)).resolves.toMatchObject({ _id: 'app1', version: '2.0' });

            expect(app.getApplicationById).toHaveBeenCalledWith('app1');
            expect(app._checkConditionalApproval).toHaveBeenCalledWith(expect.objectContaining({ _id: 'app1', status: APPROVED, version: '2.0' }));
            expect(app._getApplicationVersionByStatus).toHaveBeenCalledWith(APPROVED, '2.0');
        });

        it('calls _checkConditionalApproval when status matches Approved case-insensitively', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            UserScope.create.mockReturnValue(userScopeMock);

            app.getApplicationById = jest.fn().mockResolvedValue({ _id: 'app1', status: 'approved', version: '2.0' });
            app._checkConditionalApproval = jest.fn().mockResolvedValue(undefined);
            app._getApplicationVersionByStatus = jest.fn().mockResolvedValue('2.0');

            await app.getApplication({ _id: 'app1' }, context);

            expect(app._checkConditionalApproval).toHaveBeenCalledWith(expect.objectContaining({ _id: 'app1', status: 'approved' }));
        });

        it('does not replace missing or whitespace-only studyAbbreviation with study name', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            UserScope.create.mockReturnValue(userScopeMock);

            app._getApplicationVersionByStatus = jest.fn().mockResolvedValue('3.0');

            app.getApplicationById = jest.fn().mockResolvedValue({
                _id: 'app1',
                status: NEW,
                studyName: 'Full Study',
                studyAbbreviation: null,
                applicant: { applicantID: 'u1', applicantName: 'Submitter', applicantEmail: 's@test.com' }
            });
            await expect(app.getApplication({ _id: 'app1' }, context)).resolves.toMatchObject({
                studyAbbreviation: null,
                studyName: 'Full Study'
            });

            app.getApplicationById = jest.fn().mockResolvedValue({
                _id: 'app1',
                status: NEW,
                studyName: 'Full Study',
                studyAbbreviation: '   ',
                applicant: { applicantID: 'u1', applicantName: 'Submitter', applicantEmail: 's@test.com' }
            });
            await expect(app.getApplication({ _id: 'app1' }, context)).resolves.toMatchObject({
                studyAbbreviation: '   ',
                studyName: 'Full Study'
            });
        });
    });

    describe('_getApplicationVersionByStatus', () => {
        it('returns new version for NEW/IN_PROGRESS/INQUIRED', async () => {
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });
            // Patch: simulate status logic for new version
            await expect(app._getApplicationVersionByStatus(NEW)).resolves.toBe('3.0');
            await expect(app._getApplicationVersionByStatus(IN_PROGRESS)).resolves.toBe('3.0');
            await expect(app._getApplicationVersionByStatus(INQUIRED)).resolves.toBe('3.0');
        });

        it('returns current version for other status if version is null', async () => {
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });
            await expect(app._getApplicationVersionByStatus(APPROVED)).resolves.toBe('2.0');
        });

        it('returns passed version if present', async () => {
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });
            await expect(app._getApplicationVersionByStatus(APPROVED, '1.5')).resolves.toBe('1.5');
        });
    });

    describe('_checkConditionalApproval', () => {
        it('sets conditional and pendingConditions if needed', async () => {
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([{ controlledAccess: true, dbGaPID: null, pendingModelChange: true }]);
            const application = { studyName: 'study1' };
            await app._checkConditionalApproval(application);
            expect(application.conditional).toBe(true);
            expect(application.pendingConditions).toContain(ERROR.CONTROLLED_STUDY_NO_DBGAPID);
            expect(application.pendingConditions).toContain(ERROR.PENDING_APPROVED_STUDY);
        });

        it('includes pending image de-identification in pendingConditions when applicable', async () => {
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([{
                controlledAccess: false,
                pendingModelChange: false,
                pendingImageDeIdentification: true
            }]);
            const application = { studyName: 'study1' };
            await app._checkConditionalApproval(application);
            expect(application.conditional).toBe(true);
            expect(application.pendingConditions).toContain(ERROR.PENDING_IMAGE_DEIDENTIFICATION_CONDITION);
        });

        it('sets conditional false and empty pendingConditions when no studies found', async () => {
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            const application = { studyName: 'study1' };
            await app._checkConditionalApproval(application);
            expect(application.conditional).toBe(false);
            expect(application.pendingConditions).toEqual([]);
        });
    });

    describe('getApplicationById', () => {
        it('returns result from applicationDAO', async () => {
            // Mock the applicationDAO.findFirst method to resolve to an application object
            app.applicationDAO = {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'app1',
                    applicant: {
                        id: '',
                        firstName: '',
                        lastName: '',
                        email: ''
                    }
                })
            };
            await expect(app.getApplicationById('app1')).resolves.toEqual({
                id: 'app1',
                applicant: {
                    applicantEmail: '',
                    applicantID: '',
                    applicantName: '',
                }
            });
            expect(app.applicationDAO.findFirst).toHaveBeenCalledWith(
                { id: 'app1' },
                {
                    include: {
                        applicant: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                fullName: true,
                                email: true
                            }
                        }
                    }
                }
            );
        });

        it('throws if not found', async () => {
            app.applicationDAO = {
                findFirst: jest.fn().mockResolvedValue(null)
            };
            await expect(app.getApplicationById('app1')).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND + 'app1');
        });
    });

    describe('createApplication', () => {
        it('creates and returns application', async () => {
            // Patch: use applicationDAO mock to avoid Prisma call
            app.applicationDAO = {
                insert: jest.fn().mockResolvedValue({ acknowledged: true }),
            };
            mockLogCollection.insert.mockResolvedValue();
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });
            const application = { controlledAccess: true };
            const userInfo = context.userInfo;
            await expect(app.createApplication(application, userInfo)).resolves.toMatchObject({ controlledAccess: true });
            expect(app.applicationDAO.insert).toHaveBeenCalled();
            expect(mockLogCollection.insert).toHaveBeenCalled();
        });

        it('defaults to New when no status is requested for new applications', async () => {
            app.applicationDAO = {
                insert: jest.fn().mockResolvedValue({ acknowledged: true }),
            };
            mockLogCollection.insert.mockResolvedValue();
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });

            const application = { controlledAccess: true };
            const userInfo = context.userInfo;

            const result = await app.createApplication(application, userInfo);

            expect(result.status).toBe(NEW);
            expect(result.history).toHaveLength(1);
            expect(result.history[0]).toMatchObject({ userID: userInfo._id, status: NEW });
            expect(app.applicationDAO.insert).toHaveBeenCalledWith(expect.objectContaining({ status: NEW }));
        });

        it('adds a New event before In Progress when requested', async () => {
            app.applicationDAO = {
                insert: jest.fn().mockResolvedValue({ acknowledged: true }),
            };
            mockLogCollection.insert.mockResolvedValue();
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });

            const application = { controlledAccess: true };
            const userInfo = context.userInfo;

            const result = await app.createApplication(application, userInfo, IN_PROGRESS);

            expect(result.status).toBe(IN_PROGRESS);
            expect(result.history).toHaveLength(2);
            expect(result.history[0]).toMatchObject({ userID: userInfo._id, status: NEW });
            expect(result.history[1]).toMatchObject({ userID: userInfo._id, status: IN_PROGRESS });
            expect(new Date(result.history[0].dateTime).getTime()).toBeLessThan(new Date(result.history[1].dateTime).getTime());
            expect(app.applicationDAO.insert).toHaveBeenCalledWith(expect.objectContaining({ status: IN_PROGRESS }));
        });
    });

    describe('saveApplication', () => {
        it('creates new application with New status if no status is provided', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            const params = { application: {} };
            jest.spyOn(app, 'createApplication').mockResolvedValue({ _id: 'app2' });
            await expect(app.saveApplication(params, context)).resolves.toEqual({ _id: 'app2' });
            expect(app.createApplication).toHaveBeenCalledWith({}, context.userInfo, NEW);
        });

        it('creates new application with In Progress status when requested', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            const params = { application: {}, status: IN_PROGRESS };
            jest.spyOn(app, 'createApplication').mockResolvedValue({ _id: 'app2' });
            await expect(app.saveApplication(params, context)).resolves.toEqual({ _id: 'app2' });
            expect(app.createApplication).toHaveBeenCalledWith({}, context.userInfo, IN_PROGRESS);
        });

        it("should throw an error when the application does not exist", async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(true);

            const params = { application: { _id: 'a-app-that-does-not-exist' } };

            await expect(app.saveApplication(params, context)).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND);
        });

        it.each([CANCELED, REJECTED, DELETED, SUBMITTED, IN_REVIEW, APPROVED])('should throw error when trying to set the status to %s', async (status) => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(true);

            jest.spyOn(app, 'getApplicationById').mockResolvedValue({ _id: 'invalid-status-provided', applicant: { applicantID: 'user1' }, status: NEW });

            const params = { application: { _id: 'invalid-status-provided' }, status };
            await expect(app.saveApplication(params, context)).rejects.toThrow(ERROR.VERIFY.INVALID_STATE_APPLICATION);
        });

        it("should throw an error if no status is provided", async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(true);

            jest.spyOn(app, 'getApplicationById').mockResolvedValue({ _id: 'no-status-provided', applicant: { applicantID: 'user1' }, status: NEW });

            const params = { application: { _id: 'no-status-provided' } }; // NOTE: We're omitting status param
            await expect(app.saveApplication(params, context)).rejects.toThrow(ERROR.VERIFY.INVALID_STATE_APPLICATION);
        });

        it('throws if not owner', async () => {
            // Setup: the stored application has a different applicantID than the current user
            const params = { application: { _id: 'app1' } };
            // Mock getApplicationById to return an application with applicantID 'other'
            jest.spyOn(app, 'getApplicationById').mockResolvedValue({ _id: 'app1', applicant: { applicantID: 'other' }, status: NEW });
            await expect(app.saveApplication(params, context)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });
    });

    describe('getMyLastApplication', () => {
        it('returns last approved application', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false); // Ensure user has scope
            userScopeMock.isAllScope.mockReturnValue(true);   // Ensure user has all scope
            // Patch: use applicationDAO mock to avoid Prisma call
            app.applicationDAO = {
                aggregate: jest.fn().mockResolvedValue([{ _id: 'app1', status: APPROVED }])
            };
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });

            // Patch: getApplicationById now expects {id: ...} and returns institution, so mock accordingly
            const applicationWithInstitution = { _id: 'app1', status: APPROVED, institution: { id: 'inst1', _id: 'inst1' } };
            jest.spyOn(app, 'getApplicationById').mockResolvedValue(applicationWithInstitution);

            const result = await app.getMyLastApplication({}, context);
            expect(result).toMatchObject({ _id: 'app1', version: '3.0', institution: { id: 'inst1', _id: 'inst1' } });
        });

        it('hydrates conditional and pendingConditions when approved study has pending image de-identification', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            UserScope.create.mockReturnValue(userScopeMock);
            app.applicationDAO = {
                aggregate: jest.fn().mockResolvedValue([{ _id: 'app1', status: APPROVED }])
            };
            mockConfigurationService.findByType.mockResolvedValue({ current: '2.0', new: '3.0' });
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([{
                controlledAccess: false,
                pendingModelChange: false,
                pendingImageDeIdentification: true
            }]);
            jest.spyOn(app, 'getApplicationById').mockResolvedValue({
                _id: 'app1',
                status: APPROVED,
                studyName: 'study1',
                institution: { id: 'inst1', _id: 'inst1' }
            });

            const result = await app.getMyLastApplication({}, context);

            expect(result).toMatchObject({
                _id: 'app1',
                version: '3.0',
                conditional: true,
                institution: { id: 'inst1', _id: 'inst1' }
            });
            expect(result.pendingConditions).toContain(ERROR.PENDING_IMAGE_DEIDENTIFICATION_CONDITION);
        });

        it('returns null when no previous approved application exists', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            
            // Mock aggregate to return empty array (no previous applications)
            app.applicationDAO = {
                aggregate: jest.fn().mockResolvedValue([])
            };

            const result = await app.getMyLastApplication({}, context);
            expect(result).toBeNull();
        });
    });

    describe('listApplications', () => {
        beforeEach(() => {
            userScopeMock.isAllScope = jest.fn(() => true);
            userScopeMock.isOwnScope = jest.fn(() => false);
            userScopeMock.isStudyScope = jest.fn(() => false);
            userScopeMock.isDCScope = jest.fn(() => false);
            mockAuthorizationService.getPermissionScope.mockResolvedValue(['all']);
            UserScope.create.mockReturnValue(userScopeMock);
        });

        it('throws LIST_APPLICATIONS_INVALID_PARAMS for invalid orderBy', async () => {
            await expect(app.listApplications({ orderBy: 'InvalidColumn' }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
        });

        it('accepts each valid orderBy and resolves successfully', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            for (const orderBy of VALID_ORDER_BY_LIST_APPLICATIONS) {
                await expect(app.listApplications({ orderBy }, context)).resolves.toBeDefined();
            }
        });

        it('accepts valid orderBy case-insensitively', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await expect(app.listApplications({ orderBy: 'CREATEDAT' }, context)).resolves.toBeDefined();
            await expect(app.listApplications({ orderBy: 'StudyName' }, context)).resolves.toBeDefined();
        });

        it('passes applicant.fullName as orderBy when orderBy is applicant.applicantName', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({ orderBy: 'applicant.applicantName' }, context);
            const findManyOptions = findManyMock.mock.calls[0][1];
            expect(findManyOptions.orderBy).toEqual({ applicant: { fullName: 'desc' } });
        });

        it('passes requested orderBy through for other valid values', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({ orderBy: 'createdAt', sortDirection: 'ASC' }, context);
            const findManyOptions = findManyMock.mock.calls[0][1];
            expect(findManyOptions.orderBy).toEqual({ createdAt: 'asc' });
        });

        it('throws LIST_APPLICATIONS_INVALID_PARAMS for invalid sortDirection', async () => {
            await expect(app.listApplications({ sortDirection: 'INVALID' }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
        });

        it('returns applications and aggregations when findMany is mocked', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            const result = await app.listApplications({}, context);
            expect(result).toHaveProperty('applications');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('programs');
            expect(result).toHaveProperty('studies');
            expect(result).toHaveProperty('studyAbbreviations');
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('submitterNames');
            expect(Array.isArray(result.applications)).toBe(true);
            expect(result.total).toBe(0);
            expect(findManyMock).toHaveBeenCalled();
        });

        it('fills studyAbbreviation with studyName in the list response when abbrev is empty', async () => {
            const row = {
                id: 'a1',
                studyName: 'My Full Study',
                studyAbbreviation: '   ',
                status: NEW,
                applicant: { id: 'u1', fullName: 'Alice', email: 'a@a' }
            };
            let n = 0;
            const findManyMock = jest.fn().mockImplementation(() => {
                n += 1;
                if (n === 1) {
                    return Promise.resolve([row]);
                }
                return Promise.resolve([]);
            });
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(1);
            const result = await app.listApplications({}, context);
            expect(result.applications[0].studyAbbreviation).toBe('My Full Study');
            expect(result.applications[0].studyName).toBe('My Full Study');
        });

        it('returns empty list when scope is study (only all and own supported for filters)', async () => {
            mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'study', scopeValues: ['study1'] }]);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(false);
            const result = await app.listApplications({}, context);
            expect(result.applications).toEqual([]);
            expect(result.total).toBe(0);
            expect(result.programs).toEqual([]);
            expect(result.studies).toEqual([]);
            expect(result.studyAbbreviations).toEqual([]);
            expect(result.status).toEqual([]);
            expect(result.submitterNames).toEqual([]);
        });

        it('returns empty list when scope is DC (only all and own supported for filters)', async () => {
            mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'dc', scopeValues: ['dc1'] }]);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(false);
            const result = await app.listApplications({}, context);
            expect(result.applications).toEqual([]);
            expect(result.total).toBe(0);
            expect(result.programs).toEqual([]);
            expect(result.studies).toEqual([]);
            expect(result.studyAbbreviations).toEqual([]);
            expect(result.status).toEqual([]);
            expect(result.submitterNames).toEqual([]);
        });

        it('throws LIST_APPLICATIONS_INVALID_PARAMS when params.statuses is not an array', async () => {
            await expect(app.listApplications({ statuses: 'APPROVED' }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
            await expect(app.listApplications({ statuses: {} }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
        });

        it('throws APPLICATION_INVALID_STATUSES for invalid status in params.statuses', async () => {
            await expect(app.listApplications({ statuses: ['InvalidStatus'] }, context))
                .rejects.toThrow(/Requested statuses.*InvalidStatus.*are not valid/);
        });

        it('accepts valid statuses case-insensitively and returns successfully', async () => {
            app.applicationDAO.findMany = jest.fn().mockResolvedValue([]);
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await expect(app.listApplications({ statuses: ['new', 'Approved'] }, context)).resolves.toBeDefined();
            const result = await app.listApplications({ statuses: ['new', 'Approved'] }, context);
            expect(result.applications).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('passes filter without status to DAO when statuses is empty array', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({ statuses: [] }, context);
            const findManyFilter = findManyMock.mock.calls[0][0];
            const countFilter = app.applicationDAO.count.mock.calls[0][0];
            expect(findManyFilter).not.toHaveProperty('status');
            expect(countFilter).not.toHaveProperty('status');
        });

        it('passes filter without status to DAO when statuses contains All', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({ statuses: ['All'] }, context);
            const findManyFilter = findManyMock.mock.calls[0][0];
            const countFilter = app.applicationDAO.count.mock.calls[0][0];
            expect(findManyFilter).not.toHaveProperty('status');
            expect(countFilter).not.toHaveProperty('status');
        });

        it('passes filter without status to DAO when statuses contains All with other statuses', async () => {
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({ statuses: ['All', 'Approved'] }, context);
            const findManyFilter = findManyMock.mock.calls[0][0];
            const countFilter = app.applicationDAO.count.mock.calls[0][0];
            expect(findManyFilter).not.toHaveProperty('status');
            expect(countFilter).not.toHaveProperty('status');
        });

        it('throws LIST_APPLICATIONS_INVALID_PARAMS for invalid first', async () => {
            await expect(app.listApplications({ first: 0 }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
            await expect(app.listApplications({ first: 1.5 }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
        });

        it('throws LIST_APPLICATIONS_INVALID_PARAMS for invalid offset', async () => {
            await expect(app.listApplications({ offset: -1 }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
            await expect(app.listApplications({ offset: 1.5 }, context))
                .rejects.toThrow(ERROR.LIST_APPLICATIONS_INVALID_PARAMS);
        });

        it('passes applicantID in filter when scope is own', async () => {
            mockAuthorizationService.getPermissionScope.mockResolvedValue(['own']);
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(true);
            const ctx = { ...context, userInfo: { ...context.userInfo, _id: 'user-123' } };
            const findManyMock = jest.fn().mockResolvedValue([]);
            app.applicationDAO.findMany = findManyMock;
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await app.listApplications({}, ctx);
            const findManyCalls = findManyMock.mock.calls;
            expect(findManyCalls.length).toBeGreaterThan(0);
            const firstCallFilter = findManyCalls[0][0];
            expect(firstCallFilter).toEqual(expect.objectContaining({ applicantID: 'user-123' }));
            const countCalls = app.applicationDAO.count.mock.calls;
            expect(countCalls.length).toBe(1);
            expect(countCalls[0][0]).toEqual(expect.objectContaining({ applicantID: 'user-123' }));
        });

        it('returns empty list when scope is none or empty', async () => {
            mockAuthorizationService.getPermissionScope.mockResolvedValue([]);
            UserScope.create.mockReturnValue({ isAllScope: () => false, isOwnScope: () => false });
            const result = await app.listApplications({}, context);
            expect(result.applications).toEqual([]);
            expect(result.total).toBe(0);
            expect(result.programs).toEqual([]);
            expect(result.studies).toEqual([]);
            expect(result.studyAbbreviations).toEqual([]);
            expect(result.status).toEqual([]);
            expect(result.submitterNames).toEqual([]);
        });

        it('returns status as array not function', async () => {
            app.applicationDAO.findMany = jest.fn().mockResolvedValue([]);
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            const result = await app.listApplications({}, context);
            expect(Array.isArray(result.status)).toBe(true);
            expect(result.status).toEqual([]);
        });

        it('rejects with LIST_APPLICATIONS_FETCH_FAILED and application list step when findMany fails for list', async () => {
            app.applicationDAO.findMany = jest.fn().mockRejectedValue(new Error('DB error'));
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await expect(app.listApplications({}, context)).rejects.toThrow(ERROR.LIST_APPLICATIONS_FETCH_FAILED);
            await expect(app.listApplications({}, context)).rejects.toThrow(/fetching application list/);
        });

        it('rejects with LIST_APPLICATIONS_FETCH_FAILED and application count step when count fails', async () => {
            app.applicationDAO.findMany = jest.fn().mockResolvedValue([]);
            app.applicationDAO.count = jest.fn().mockRejectedValue(new Error('Count failed'));
            await expect(app.listApplications({}, context)).rejects.toThrow(ERROR.LIST_APPLICATIONS_FETCH_FAILED);
            await expect(app.listApplications({}, context)).rejects.toThrow(/fetching application count/);
        });

        it('rejects with LIST_APPLICATIONS_FETCH_FAILED when a filter-option query fails', async () => {
            let findManyCallCount = 0;
            app.applicationDAO.findMany = jest.fn().mockImplementation(() => {
                findManyCallCount++;
                if (findManyCallCount === 1) return Promise.resolve([]);
                if (findManyCallCount === 2) return Promise.resolve([]);
                return Promise.reject(new Error('Filter query failed'));
            });
            app.applicationDAO.count = jest.fn().mockResolvedValue(0);
            await expect(app.listApplications({}, context)).rejects.toThrow(ERROR.LIST_APPLICATIONS_FETCH_FAILED);
        });

        describe('studyName filter (searches both studyName and studyAbbreviation)', () => {
            it('passes OR condition when studyName is provided', async () => {
                const findManyMock = jest.fn().mockResolvedValue([]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(0);
                await app.listApplications({ studyName: 'UniqueName' }, context);
                const filter = findManyMock.mock.calls[0][0];
                expect(filter.OR).toBeDefined();
                expect(Array.isArray(filter.OR)).toBe(true);
                expect(filter.OR).toHaveLength(2);
                expect(filter.OR[0]).toEqual({ studyName: { contains: 'UniqueName', mode: 'insensitive' } });
                expect(filter.OR[1]).toEqual({ studyAbbreviation: { contains: 'UniqueName', mode: 'insensitive' } });
            });

            it('returns applications matching study name when studyName filter is used', async () => {
                const matchingApp = { id: 'app1', studyName: 'Cancer Study', studyAbbreviation: 'CS', status: NEW, applicant: { fullName: 'Alice' } };
                const findManyMock = jest.fn().mockResolvedValue([matchingApp]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(1);
                const result = await app.listApplications({ studyName: 'Cancer' }, context);
                expect(result.applications.length).toBe(1);
                expect(result.applications[0].studyName).toBe('Cancer Study');
                expect(result.total).toBe(1);
            });

            it('returns applications matching study abbreviation when studyName filter is used', async () => {
                const matchingApp = { id: 'app2', studyName: 'Other Study', studyAbbreviation: 'BRF', status: NEW, applicant: { fullName: 'Bob' } };
                const findManyMock = jest.fn().mockResolvedValue([matchingApp]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(1);
                const result = await app.listApplications({ studyName: 'BRF' }, context);
                expect(result.applications.length).toBe(1);
                expect(result.applications[0].studyAbbreviation).toBe('BRF');
                expect(result.total).toBe(1);
            });

            it('studyName filter is case-insensitive', async () => {
                const findManyMock = jest.fn().mockResolvedValue([]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(0);
                await app.listApplications({ studyName: 'aBc' }, context);
                const filter = findManyMock.mock.calls[0][0];
                expect(filter.OR[0].studyName).toEqual({ contains: 'aBc', mode: 'insensitive' });
                expect(filter.OR[1].studyAbbreviation).toEqual({ contains: 'aBc', mode: 'insensitive' });
            });

            it('escapes regex metacharacters in studyName search term', async () => {
                const findManyMock = jest.fn().mockResolvedValue([]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(0);
                await app.listApplications({ studyName: '***' }, context);
                const filter = findManyMock.mock.calls[0][0];
                expect(filter.OR[0].studyName).toEqual({ contains: '\\*\\*\\*', mode: 'insensitive' });
                expect(filter.OR[1].studyAbbreviation).toEqual({ contains: '\\*\\*\\*', mode: 'insensitive' });
            });

            it('does not add study filter when studyName is All', async () => {
                const findManyMock = jest.fn().mockResolvedValue([]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(0);
                await app.listApplications({ studyName: 'All' }, context);
                const filter = findManyMock.mock.calls[0][0];
                expect(filter.OR).toBeUndefined();
            });

            it('does not add study filter when studyName is empty string', async () => {
                const findManyMock = jest.fn().mockResolvedValue([]);
                app.applicationDAO.findMany = findManyMock;
                app.applicationDAO.count = jest.fn().mockResolvedValue(0);
                await app.listApplications({ studyName: '' }, context);
                const filter = findManyMock.mock.calls[0][0];
                expect(filter.OR).toBeUndefined();
            });

            it('returns distinct studies and studyAbbreviations when studyName filter is applied', async () => {
                const apps = [
                    { id: 'app1', studyName: 'Study One', studyAbbreviation: 'S1', status: NEW, applicant: { fullName: 'A' } },
                    { id: 'app2', studyName: 'Study One', studyAbbreviation: 'S2', status: NEW, applicant: { fullName: 'B' } }
                ];
                const studyDistinctRows = [
                    { studyName: 'Study One', studyAbbreviation: 'S1' },
                    { studyName: 'Study One', studyAbbreviation: 'S2' }
                ];
                let callIndex = 0;
                app.applicationDAO.findMany = jest.fn().mockImplementation((filter, options) => {
                    callIndex++;
                    if (callIndex === 1) return Promise.resolve(apps);
                    if (callIndex === 2) {
                        expect(filter.OR).toBeDefined();
                        expect(options?.select?.studyName).toBe(true);
                        expect(options?.select?.studyAbbreviation).toBe(true);
                        return Promise.resolve(studyDistinctRows);
                    }
                    return Promise.resolve([]);
                });
                app.applicationDAO.count = jest.fn().mockResolvedValue(2);
                const result = await app.listApplications({ studyName: 'Study' }, context);
                expect(result.studies).toEqual(['Study One']);
                expect(result.studyAbbreviations).toEqual(expect.arrayContaining(['S1', 'S2']));
                expect(result.studyAbbreviations).toHaveLength(2);
            });
        });
    });

    describe('_getUserScope', () => {

        it('throws if invalid', async () => {
            UserScope.create.mockReturnValue({ isNoneScope: () => false, isAllScope: () => false, isOwnScope: () => false });
            mockAuthorizationService.getPermissionScope.mockResolvedValue(['invalid']);
            await expect(app._getUserScope(context.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW))
                .rejects.toThrow(/permission/i);
        });
    });

    describe('approveApplication', () => {
        it('throws error if duplicate approved study', async () => {
            app.getApplicationById = jest.fn().mockResolvedValue({ _id: 'app1', status: IN_REVIEW, studyName: 'study1' });
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([{ _id: 'study1' }]);
            // Patch: Accept any error message containing "duplicate" (case-insensitive)
            await expect(app.approveApplication({ _id: 'app1', comment: 'Approved' }, context))
                .rejects.toThrow(/duplicate/i);
        });

        it('throws UPDATE_FAILED when DAO update returns falsy and does not call addNewInstitutions', async () => {
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue({ _id: 'program1' });
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app._getApplicationVersionByStatus = jest.fn().mockResolvedValue('1.0');
            app.applicationDAO.update = jest.fn().mockResolvedValue(null);

            await expect(app.approveApplication({ _id: 'app1', comment: 'Approved' }, context))
                .rejects.toThrow(ERROR.UPDATE_FAILED);

            expect(mockInstitutionService.addNewInstitutions).not.toHaveBeenCalled();
        });

        it('should create program before creating study when no existing program', async () => {
            const mockApplication = { 
                _id: 'app1', 
                status: IN_REVIEW, 
                studyName: 'study1',
                programName: 'Program One',
                programAbbreviation: 'PO',
                programDescription: 'Program Description',
                questionnaireData: JSON.stringify({ program: { _id: null } })
            };
            const mockQuestionnaire = { program: { _id: null } };
            const mockNewProgram = { _id: 'new-program-1', name: 'Program One' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            mockOrganizationService.upsertByProgramName.mockResolvedValue(mockNewProgram);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload })
            );
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(mockOrganizationService.upsertByProgramName).toHaveBeenCalledWith(
                'Program One', 'PO', 'Program Description'
            );
            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'app1',
                    studyName: 'study1',
                    status: APPROVED,
                    reviewComment: 'Approved',
                }),
                mockQuestionnaire,
                undefined,
                undefined,
                undefined,
                mockNewProgram
            );
        });

        it('sends approveQuestionNotification when there are no pending approval conditions and submitter opted into review emails', async () => {
            const reviewNotification = USER_PERMISSION_CONSTANTS.EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW;
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                studyAbbreviation: 'S1',
                applicantID: 'user-applicant-1',
                applicant: {
                    applicantID: 'user-applicant-1',
                    applicantEmail: 'submitter@test.com',
                    applicantName: 'Submitter Name'
                },
                programName: 'Program One',
                programAbbreviation: 'PO',
                programDescription: 'Program Description',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' }, accessTypes: [], study: {} };
            const mockExistingProgram = { _id: 'program1', name: 'Program One' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload, GPAName: 'GPA' })
            );
            const approvedFromDb = {
                ...mockApplication,
                status: APPROVED,
                reviewComment: 'Approved',
                history: []
            };
            app.getApplicationById = jest.fn()
                .mockResolvedValueOnce(mockApplication)
                .mockResolvedValueOnce(approvedFromDb);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.find.mockResolvedValueOnce([{
                email: 'submitter@test.com',
                notifications: [reviewNotification]
            }]);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(mockNotificationsService.approveQuestionNotification).toHaveBeenCalled();
            expect(mockNotificationsService.multipleChangesApproveQuestionNotification).not.toHaveBeenCalled();
            expect(mockNotificationsService.pendingImageDeIdentificationApproveQuestionNotification).not.toHaveBeenCalled();
        });

        it('sends pendingImageDeIdentificationApproveQuestionNotification when only pending image de-identification', async () => {
            const reviewNotification = USER_PERMISSION_CONSTANTS.EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW;
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                studyAbbreviation: 'S1',
                applicantID: 'user-applicant-1',
                applicant: {
                    applicantID: 'user-applicant-1',
                    applicantEmail: 'submitter@test.com',
                    applicantName: 'Submitter Name'
                },
                programName: 'Program One',
                programAbbreviation: 'PO',
                programDescription: 'Program Description',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' }, accessTypes: [], study: {} };
            const mockExistingProgram = { _id: 'program1', name: 'Program One' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload, GPAName: 'GPA' })
            );
            const approvedFromDb = {
                ...mockApplication,
                status: APPROVED,
                reviewComment: 'Looks good',
                history: []
            };
            app.getApplicationById = jest.fn()
                .mockResolvedValueOnce(mockApplication)
                .mockResolvedValueOnce(approvedFromDb);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.find.mockResolvedValueOnce([{
                email: 'submitter@test.com',
                notifications: [reviewNotification]
            }]);

            await app.approveApplication({
                _id: 'app1',
                comment: 'Looks good',
                pendingImageDeIdentification: true
            }, context);

            expect(mockNotificationsService.approveQuestionNotification).not.toHaveBeenCalled();
            expect(mockNotificationsService.pendingImageDeIdentificationApproveQuestionNotification).toHaveBeenCalledWith(
                'submitter@test.com',
                expect.any(Array),
                expect.any(Array),
                expect.objectContaining({
                    firstName: 'Submitter Name',
                    reviewComments: 'Looks good',
                    study: 'study1',
                    contactEmail: mockEmailParams.conditionalSubmissionContact,
                    submissionGuideURL: mockEmailParams.submissionGuideURL
                })
            );
        });

        it('sends multipleChangesApproveQuestionNotification when image de-identification and model change pendings', async () => {
            const reviewNotification = USER_PERMISSION_CONSTANTS.EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW;
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                applicantID: 'user-applicant-1',
                applicant: {
                    applicantID: 'user-applicant-1',
                    applicantEmail: 'submitter@test.com',
                    applicantName: 'Submitter Name'
                },
                programName: 'Program One',
                programAbbreviation: 'PO',
                programDescription: 'Program Description',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' }, accessTypes: [], study: {} };
            const mockExistingProgram = { _id: 'program1', name: 'Program One' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload, GPAName: 'GPA' })
            );
            const approvedFromDb = {
                ...mockApplication,
                status: APPROVED,
                reviewComment: 'Approved with conditions',
                history: []
            };
            app.getApplicationById = jest.fn()
                .mockResolvedValueOnce(mockApplication)
                .mockResolvedValueOnce(approvedFromDb);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.find.mockResolvedValueOnce([{
                email: 'submitter@test.com',
                notifications: [reviewNotification]
            }]);

            await app.approveApplication({
                _id: 'app1',
                comment: 'Approved with conditions',
                pendingModelChange: true,
                pendingImageDeIdentification: true
            }, context);

            expect(mockNotificationsService.approveQuestionNotification).not.toHaveBeenCalled();
            expect(mockNotificationsService.pendingImageDeIdentificationApproveQuestionNotification).not.toHaveBeenCalled();
            expect(mockNotificationsService.multipleChangesApproveQuestionNotification).toHaveBeenCalledWith(
                'submitter@test.com',
                expect.any(Array),
                expect.any(Array),
                expect.objectContaining({
                    firstName: 'Submitter Name',
                    reviewComments: 'Approved with conditions',
                    study: 'study1'
                }),
                false,
                true,
                false,
                true
            );
        });

        it('should pass pendingImageDeIdentification to _saveApprovedStudies when provided', async () => {
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                programName: 'Program One',
                programAbbreviation: 'PO',
                programDescription: 'Program Description',
                questionnaireData: JSON.stringify({ program: { _id: null } })
            };
            const mockQuestionnaire = { program: { _id: null } };
            const mockNewProgram = { _id: 'new-program-1', name: 'Program One' };

            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            mockOrganizationService.upsertByProgramName.mockResolvedValue(mockNewProgram);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload })
            );
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({
                _id: 'app1',
                comment: 'Approved',
                pendingImageDeIdentification: true
            }, context);

            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'app1',
                    studyName: 'study1',
                    status: APPROVED,
                    reviewComment: 'Approved',
                }),
                mockQuestionnaire,
                undefined,
                true,
                undefined,
                mockNewProgram
            );
        });

        it('returns conditional and pendingConditions on the approved application when the study has pending image de-identification', async () => {
            const mockApplication = {
                _id: 'app1',
                status: IN_REVIEW,
                studyName: 'study1',
                programName: 'Existing Program',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' } };
            const mockExistingProgram = { _id: 'program1', name: 'Existing Program' };
            const approvedFromDb = {
                ...mockApplication,
                status: APPROVED,
                reviewComment: 'Approved',
                history: []
            };

            mockApprovedStudiesService.findByStudyName
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{
                    controlledAccess: false,
                    pendingModelChange: false,
                    pendingImageDeIdentification: true
                }]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.getApplicationById = jest.fn()
                .mockResolvedValueOnce(mockApplication)
                .mockResolvedValueOnce(approvedFromDb);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload })
            );
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            const result = await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(result.status).toBe(APPROVED);
            expect(result.conditional).toBe(true);
            expect(result.pendingConditions).toContain(ERROR.PENDING_IMAGE_DEIDENTIFICATION_CONDITION);
        });

        it('should use existing program when program exists', async () => {
            const mockApplication = { 
                _id: 'app1', 
                status: IN_REVIEW, 
                studyName: 'study1',
                programName: 'Existing Program',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' } };
            const mockExistingProgram = { _id: 'program1', name: 'Existing Program' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload })
            );
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(mockOrganizationService.upsertByProgramName).not.toHaveBeenCalled();
            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'app1',
                    studyName: 'study1',
                    status: APPROVED,
                    reviewComment: 'Approved',
                }),
                mockQuestionnaire,
                undefined,
                undefined,
                undefined,
                mockExistingProgram
            );
        });

        it('should throw error for duplicate program when no existing program', async () => {
            const mockApplication = { 
                _id: 'app1', 
                status: IN_REVIEW, 
                studyName: 'study1',
                programName: 'Duplicate Program',
                questionnaireData: JSON.stringify({ program: { _id: null } })
            };
            const mockQuestionnaire = { program: { _id: null } };
            const mockDuplicateProgram = { _id: 'duplicate1', name: 'Duplicate Program' };
            
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(mockDuplicateProgram);
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await expect(app.approveApplication({ _id: 'app1', comment: 'Approved' }, context))
                .rejects.toThrow(/duplicate/i);
        });

        it('should not throw error for duplicate program when existing program exists', async () => {
            const mockApplication = { 
                _id: 'app1', 
                status: IN_REVIEW, 
                studyName: 'study1',
                programName: 'Existing Program',
                questionnaireData: JSON.stringify({ program: { _id: 'program1' } })
            };
            const mockQuestionnaire = { program: { _id: 'program1' } };
            const mockExistingProgram = { _id: 'program1', name: 'Existing Program' };
            const mockDuplicateProgram = { _id: 'duplicate1', name: 'Existing Program' };

            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(mockDuplicateProgram);
            app.applicationDAO.update = jest.fn().mockImplementation((payload) =>
                Promise.resolve({ ...mockApplication, ...payload })
            );
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'app1',
                    studyName: 'study1',
                    status: APPROVED,
                    reviewComment: 'Approved',
                }),
                mockQuestionnaire,
                undefined,
                undefined,
                undefined,
                mockExistingProgram
            );
        });
    });

    describe("_saveApprovedStudies", () => {
        it.each([
            ["phs001234", "phs001234"],
            ["phs001234.v5", "phs001234"],
            ["phs001234.p3", "phs001234"],
            ["phs001234.v5.p2", "phs001234"],
            ["phs001234.v5.p2 ", "phs001234"],
        ])(
            "should store only the base phs prefix and 6 digits when dbGaPPPHSNumber is %s",
            async (phsInput, expectedBase) => {
                const aApplication = {
                    _id: 'app1',
                    studyName: 'Study One',
                    studyAbbreviation: 'STUDY1',
                    organization: { name: 'Org One' },
                    controlledAccess: true,
                    ORCID: '0000-0001',
                    PI: 'PI Name',
                    openAccess: false,
                    programName: 'Program One',
                };
                const questionnaire = {
                    study: { name: 'Study One Name', dbGaPPPHSNumber: phsInput },
                };
                mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

                await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

                expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
                const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
                expect(args[3]).toBe(expectedBase);
            }
        );

        it.each([
            ['', null],
            [' ', null],
            ['phs', null],
            ['phs1234', null],
            ['phs00123', null],
            ['001234', null],
            ['phs-001234', null],
            ['abc', null],
            ['.v5', null],
        ])(
            "should default to null when it doesn't start with phs prefix and 6 digits: %s",
            async (phsInput) => {
                const aApplication = {
                    _id: 'app1',
                    studyName: 'Study One',
                    studyAbbreviation: 'STUDY1',
                    organization: { name: 'Org One' },
                    controlledAccess: true,
                    ORCID: '0000-0001',
                    PI: 'PI Name',
                    openAccess: false,
                    programName: 'Program One',
                };
                const questionnaire = {
                    study: { name: 'Study One Name', dbGaPPPHSNumber: phsInput },
                };
                mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

                await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

                expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
                const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
                expect(args[3]).toBeNull();
            }
        );

        it('should handle null dbGaPPPHSNumber value', async () => {
            const aApplication = {
                _id: 'app1',
                studyName: 'Study One',
                studyAbbreviation: 'STUDY1',
                organization: { name: 'Org One' },
                controlledAccess: true,
                ORCID: '0000-0001',
                PI: 'PI Name',
                openAccess: false,
                programName: 'Program One',
            };
            const questionnaire = {
                study: { name: 'Study One Name', dbGaPPPHSNumber: null },
            };
            mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

            await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

            expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[3]).toBeNull();
        });

        it('should pass application ID as first argument to storeApprovedStudies', async () => {
            const aApplication = {
                _id: 'app-123',
                studyName: 'Study One',
                studyAbbreviation: 'STUDY1',
                organization: { name: 'Org One' },
                controlledAccess: true,
                ORCID: '0000-0001',
                PI: 'PI Name',
                openAccess: false,
                programName: 'Program One',
            };
            const questionnaire = {
                study: { name: 'Study One Name', dbGaPPPHSNumber: 'phs001234' },
            };
            mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

            await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

            expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[0]).toBe('app-123'); // applicationID should be first argument
        });

        it('should pass undefined applicationID when application has no _id', async () => {
            const aApplication = {
                studyName: 'Study One',
                studyAbbreviation: 'STUDY1',
                organization: { name: 'Org One' },
                controlledAccess: true,
                ORCID: '0000-0001',
                PI: 'PI Name',
                openAccess: false,
                programName: 'Program One',
            };
            const questionnaire = {
                study: { name: 'Study One Name', dbGaPPPHSNumber: 'phs001234' },
            };
            mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

            await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

            expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[0]).toBeUndefined(); // applicationID should be undefined when no _id
        });

        // Application passes the trimmed form field only (no questionnaire fallback). ApprovedStudiesService.storeApprovedStudies persists studyName when abbrev is empty.
        it('should pass empty trimmed studyAbbreviation from application to storeApprovedStudies, not questionnaire.study.name', async () => {
            const aApplication = {
                _id: 'app1',
                studyName: 'Study One',
                studyAbbreviation: '   ',
                organization: { name: 'Org One' },
                controlledAccess: true,
                ORCID: '0000-0001',
                PI: 'PI Name',
                openAccess: false,
                programName: 'Program One',
            };
            const questionnaire = {
                study: { name: 'From Questionnaire Only', dbGaPPPHSNumber: 'phs001234' },
            };
            mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

            await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[2]).toBe('');
        });

        it('should preserve studyAbbreviation when it matches studyName (user input)', async () => {
            const aApplication = {
                _id: 'app1',
                studyName: 'Short Name',
                studyAbbreviation: 'Short Name',
                organization: { name: 'Org One' },
                controlledAccess: true,
                ORCID: '0000-0001',
                PI: 'PI Name',
                openAccess: false,
                programName: 'Program One',
            };
            const questionnaire = {
                study: { name: 'Other questionnaire label', dbGaPPPHSNumber: 'phs001234' },
            };
            mockApprovedStudiesService.storeApprovedStudies.mockResolvedValue({ _id: 'approvedStudy1' });

            await app._saveApprovedStudies(aApplication, questionnaire, false, undefined, false, null);

            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[2]).toBe('Short Name');
        });
    });

    describe('inquireApplication', () => {
        const reviewNotification = USER_PERMISSION_CONSTANTS.EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW;

        function makeApplication(overrides = {}) {
            return {
                _id: 'app1',
                status: IN_REVIEW,
                version: '1.0',
                studyName: 'Default Study',
                studyAbbreviation: 'DS',
                questionnaireData: '{}',
                applicant: {
                    applicantID: 'user-applicant-1',
                    applicantEmail: 'submitter@test.com',
                    applicantName: 'Submitter Name'
                },
                history: [],
                ...overrides
            };
        }

        beforeEach(() => {
            app.verifyReviewerPermission = jest.fn().mockResolvedValue();
            app._getApplicationVersionByStatus = jest.fn().mockResolvedValue('1.0');
            app.applicationDAO.update = jest.fn().mockResolvedValue({ acknowledged: true });
            mockUserService.getUsersByNotifications = jest.fn().mockResolvedValue([]);
            mockUserService.userCollection.find = jest.fn().mockResolvedValue([{
                _id: 'user-applicant-1',
                email: 'submitter@test.com',
                notifications: [reviewNotification]
            }]);
            mockNotificationsService.inquireQuestionNotification = jest.fn().mockResolvedValue();
        });

        it('passes studyName and studyAbbreviation as NA when whitespace-only, null, or empty', async () => {
            app.getApplicationById = jest.fn().mockResolvedValue(makeApplication({
                studyName: '   ',
                studyAbbreviation: null
            }));
            await app.inquireApplication({ _id: 'app1', comment: 'Please clarify' }, context);
            expect(mockNotificationsService.inquireQuestionNotification).toHaveBeenCalledWith(
                'submitter@test.com',
                expect.any(Array),
                expect.any(Array),
                expect.objectContaining({
                    firstName: 'Submitter Name',
                    reviewComments: 'Please clarify',
                    studyName: 'NA',
                    studyAbbreviation: 'NA'
                }),
                {}
            );
        });

        it('trims non-empty studyName and studyAbbreviation for the inquire email', async () => {
            app.getApplicationById = jest.fn().mockResolvedValue(makeApplication({
                studyName: '  My Full Study  ',
                studyAbbreviation: '  ABBR  '
            }));
            await app.inquireApplication({ _id: 'app1', comment: 'Need details' }, context);
            expect(mockNotificationsService.inquireQuestionNotification).toHaveBeenCalledWith(
                'submitter@test.com',
                expect.any(Array),
                expect.any(Array),
                expect.objectContaining({
                    firstName: 'Submitter Name',
                    reviewComments: 'Need details',
                    studyName: 'My Full Study',
                    studyAbbreviation: 'ABBR'
                }),
                {}
            );
        });

        it('uses NA for study fields when the application object omits them', async () => {
            const withoutStudy = makeApplication();
            delete withoutStudy.studyName;
            delete withoutStudy.studyAbbreviation;
            app.getApplicationById = jest.fn().mockResolvedValue(withoutStudy);
            await app.inquireApplication({ _id: 'app1', comment: 'R' }, context);
            expect(mockNotificationsService.inquireQuestionNotification).toHaveBeenCalledWith(
                'submitter@test.com',
                expect.any(Array),
                expect.any(Array),
                expect.objectContaining({ studyName: 'NA', studyAbbreviation: 'NA' }),
                {}
            );
        });
    });

    // The file already contains comprehensive unit tests for the Application service.
    // No further changes are needed for basic coverage.
});
