const { Application } = require('../../services/application'); // Adjust if needed
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
    dataModelChangeApproveQuestionNotification: jest.fn()
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

        it('does nothing if no studies found', async () => {
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            const application = { studyName: 'study1' };
            await app._checkConditionalApproval(application);
            expect(application.conditional).toBeUndefined();
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
    });

    describe('saveApplication', () => {
        it('creates new application if no id', async () => {
            userScopeMock.isNoneScope.mockReturnValue(false);
            userScopeMock.isAllScope.mockReturnValue(true);
            const params = { application: {} };
            jest.spyOn(app, 'createApplication').mockResolvedValue({ _id: 'app2' });
            await expect(app.saveApplication(params, context)).resolves.toEqual({ _id: 'app2' });
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

    describe('_listApplicationConditions', () => {
        it('returns correct filter for all scope', () => {
            userScopeMock.isAllScope.mockReturnValue(true);
            userScopeMock.isOwnScope.mockReturnValue(false);
            const cond = app._listApplicationConditions('user1', userScopeMock, 'prog', 'study', 'abbr', [NEW], 'John');
            expect(cond).toHaveProperty('status');
            expect(cond).toHaveProperty('programName');
            expect(cond).toHaveProperty('studyName');
            expect(cond).toHaveProperty('studyAbbreviation');
            // With the new implementation, applicant name filter uses fullName instead of OR array
            expect(cond).toHaveProperty('applicant');
            expect(cond.applicant).toHaveProperty('is');
            expect(cond.applicant.is).toHaveProperty('fullName');
            expect(cond.applicant.is.fullName).toHaveProperty('contains', 'John');
            expect(cond.applicant.is.fullName).toHaveProperty('mode', 'insensitive');
            // For all scope, should NOT have applicantID
            expect(cond).not.toHaveProperty('applicantID');
        });

        it('returns correct filter for own scope', () => {
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(true);
            const cond = app._listApplicationConditions('user1', userScopeMock, 'prog', 'study', 'abbr', [NEW], 'John');
            // For own scope, the filter should include applicantID at the root
            expect(cond).toHaveProperty('applicantID', 'user1');
            expect(cond).toHaveProperty('status');
            expect(cond).toHaveProperty('programName');
            expect(cond).toHaveProperty('studyName');
            expect(cond).toHaveProperty('studyAbbreviation');
        });

        it('throws for invalid scope', () => {
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isOwnScope.mockReturnValue(false);
            // Accept any error message containing "permission"
            expect(() => app._listApplicationConditions('user1', userScopeMock, 'prog', 'study', 'abbr', [NEW], 'John'))
                .toThrow(/permission/i);
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
            
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            mockOrganizationService.upsertByProgramName.mockResolvedValue(mockNewProgram);
            app.applicationDAO.update = jest.fn().mockResolvedValue(true);
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
                true, mockQuestionnaire, undefined, undefined, mockNewProgram
            );
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
            
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(null);
            app.applicationDAO.update = jest.fn().mockResolvedValue(true);
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(mockOrganizationService.upsertByProgramName).not.toHaveBeenCalled();
            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                true, mockQuestionnaire, undefined, undefined, mockExistingProgram
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
            
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            mockApprovedStudiesService.findByStudyName.mockResolvedValue([]);
            mockOrganizationService.getOrganizationByID.mockResolvedValue(mockExistingProgram);
            mockOrganizationService.findOneByProgramName.mockResolvedValue(mockDuplicateProgram);
            app.applicationDAO.update = jest.fn().mockResolvedValue(true);
            app.getApplicationById = jest.fn().mockResolvedValue(mockApplication);
            app._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'study1' });
            app._findUsersByApplicantIDs = jest.fn().mockResolvedValue([]);
            mockLogCollection.insert.mockResolvedValue();
            global.getApplicationQuestionnaire = jest.fn().mockReturnValue(mockQuestionnaire);

            await app.approveApplication({ _id: 'app1', comment: 'Approved' }, context);

            expect(app._saveApprovedStudies).toHaveBeenCalledWith(
                true, mockQuestionnaire, undefined, undefined, mockExistingProgram
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

                await app._saveApprovedStudies(aApplication, questionnaire, false, false, null);

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

                await app._saveApprovedStudies(aApplication, questionnaire, false, false, null);

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

            await app._saveApprovedStudies(aApplication, questionnaire, false, false, null);

            expect(mockApprovedStudiesService.storeApprovedStudies).toHaveBeenCalled();
            const args = mockApprovedStudiesService.storeApprovedStudies.mock.calls[0];
            expect(args[3]).toBeNull();
        });
    });

    // The file already contains comprehensive unit tests for the Application service.
    // No further changes are needed for basic coverage.
});
