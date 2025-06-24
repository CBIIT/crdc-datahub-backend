const { Application } = require('../../services/application');
const { APPROVED, IN_PROGRESS, IN_REVIEW } = require('../../constants/application-constants');
const ERROR = require('../../constants/error-constants');

// ✅ Mock session verification
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));

jest.mock('../../domain/user-scope', () => ({
    UserScope: {
        create: jest.fn(() => ({
            isNoneScope: () => false,
            isAllScope: () => true,
            isOwnScope: () => false
        }))
    }
}));

describe('Application API Unit Tests', () => {
    let appInstance;
    let applicationCollection;
    let approvedStudiesService;
    let configurationService;
    let authorizationService;
    let institutionService;
    let userService;
    let organizationService;
    let dbService;
    let logCollection;

    beforeEach(() => {
        applicationCollection = {
            find: jest.fn(),
            aggregate: jest.fn().mockResolvedValue([]),
            distinct: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue({ modifiedCount: 1 })
        };
        approvedStudiesService = {
            findByStudyName: jest.fn().mockResolvedValue([]),
            storeApprovedStudies: jest.fn().mockResolvedValue({ _id: 'newStudyId' })
        };
        configurationService = {
            findByType: jest.fn().mockResolvedValue({ current: '3.0', new: '4.0' })
        };
        authorizationService = {
            getPermissionScope: jest.fn().mockResolvedValue(['all'])
        };
        institutionService = {
            addNewInstitutions: jest.fn()
        };
        userService = {
            userCollection: {
                find: jest.fn().mockResolvedValue([{ email: 'user@example.com', notifications: ['submit'] }])
            },
            getUsersByNotifications: jest.fn().mockResolvedValue([{ email: 'bcc@example.com' }]),
            updateUserInfo: jest.fn()
        };
        organizationService = {
            findOneByProgramName: jest.fn().mockResolvedValue([]),
            getOrganizationByID: jest.fn().mockResolvedValue({ _id: 'org1', studies: [] }),
            upsertByProgramName: jest.fn(),
            organizationCollection: {
                update: jest.fn()
            }
        };
        dbService = {
            updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
        };
        logCollection = {
            insert: jest.fn()
        };

        appInstance = new Application(
            logCollection,
            applicationCollection,
            approvedStudiesService,
            userService,
            dbService,
            {}, // notificationService
            {}, // emailParams
            organizationService,
            institutionService,
            configurationService,
            authorizationService
        );

        appInstance._getUserScope = jest.fn().mockResolvedValue({
            isNoneScope: () => false,
            isAllScope: () => true,
            isOwnScope: () => false
        });
        appInstance._checkConditionalApproval = jest.fn().mockImplementation((app) => {
            app.conditional = true;
            app.pendingConditions = ['some condition'];
        });
        appInstance._getApplicationVersionByStatus = jest.fn().mockResolvedValue('3.0');
        appInstance.getApplicationById = jest.fn().mockResolvedValue({
            _id: 'app123',
            status: IN_REVIEW,
            version: '1.0',
            studyName: 'Study A',
            programName: 'Program X',
            programAbbreviation: 'PX',
            programDescription: 'Desc',
            applicant: {
                applicantID: 'user1',
                applicantEmail: 'user@example.com',
                applicantName: 'User One'
            },
            questionnaireData: JSON.stringify({
                accessTypes: ['Controlled Access'],
                study: { dbGaPPPHSNumber: '' },
                program: { _id: 'prog123' }
            })
        });
        appInstance.sendEmailAfterApproveApplication = jest.fn();
        appInstance._saveApprovedStudies = jest.fn().mockResolvedValue({ _id: 'newStudyId' });
    });

    test('getApplication throws if user has no permission', async () => {
        appInstance._getUserScope.mockResolvedValueOnce({ isNoneScope: () => true });
        await expect(appInstance.getApplication({ _id: 'app123' }, { userInfo: { _id: 'user1' } })).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    test('listApplications returns structured list of applications', async () => {
        const mockApp = { _id: 'app123', status: APPROVED };
        applicationCollection.aggregate
            .mockResolvedValueOnce([mockApp])
            .mockResolvedValueOnce([{ count: 1 }])
            .mockResolvedValueOnce(['ProgramA'])
            .mockResolvedValueOnce(['StudyA'])
            .mockResolvedValueOnce([APPROVED])
            .mockResolvedValueOnce(['Submitter A']);

        const params = {
            statuses: [APPROVED],
            programName: 'ProgramA',
            studyName: 'StudyA',
            submitterName: 'Submitter A',
            first: 10,
            offset: 0,
            orderBy: 'createdAt',
            sortDirection: 'desc'
        };

        const context = { userInfo: { _id: 'user1', role: 'federal' } };
        const result = await appInstance.listApplications(params, context);

        expect(result.total).toBe(1);
        expect(Array.isArray(result.applications)).toBe(true);
        expect(Array.isArray(result.programs)).toBe(true);
        expect(Array.isArray(result.studies)).toBe(true);
        expect(Array.isArray(result.submitterNames)).toBe(true);
        expect(typeof result.status()).toBe('object');
    });

    test('approveApplication successfully approves an application', async () => {
        const document = {
            _id: 'app123',
            comment: 'Looks good.',
            institutions: [],
            wholeProgram: true,
            pendingModelChange: false
        };

        const context = {
            userInfo: {
                _id: 'user1',
                email: 'user@example.com',
                IDP: 'nih',
                studies: [],
                userStatus: 'ACTIVE',
                role: 'federal'
            }
        };

        const result = await appInstance.approveApplication(document, context);
        expect(result).toBeDefined();
        expect(appInstance.getApplicationById).toHaveBeenCalledWith('app123');
        expect(appInstance._getApplicationVersionByStatus).toHaveBeenCalled();
        expect(institutionService.addNewInstitutions).toHaveBeenCalled();
        expect(logCollection.insert).toHaveBeenCalled();
        expect(appInstance.sendEmailAfterApproveApplication).toHaveBeenCalled();
    });

    test.each([true, false])('approveApplication sets pendingModelChange = %s', async (pendingModelChange) => {
        const document = {
            _id: 'app123',
            comment: 'Looks good.',
            institutions: [],
            wholeProgram: true,
            pendingModelChange
        };

        const context = {
            userInfo: {
                _id: 'user1',
                email: 'user@example.com',
                IDP: 'nih',
                studies: [],
                userStatus: 'ACTIVE',
                role: 'federal'
            }
        };

        const result = await appInstance.approveApplication(document, context);
        expect(result).toBeDefined();
        expect(appInstance._saveApprovedStudies).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            pendingModelChange
        );
    });
});
