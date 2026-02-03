const { Submission } = require('../../services/submission');
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED, VALIDATION } = require('../../constants/submission-constants');
const USER_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-constants');
const ERROR = require('../../constants/error-constants');

const ROLES = USER_CONSTANTS.USER.ROLES;

// Mock dependencies
jest.mock('../../dao/submission');
jest.mock('../../dao/program');
jest.mock('../../dao/user');
jest.mock('../../dao/approvedStudy');
jest.mock('../../dao/validation');
jest.mock('../../dao/dataRecords');
jest.mock('../../dao/pendingPV');
jest.mock('../../services/user');
jest.mock('../../services/data-record-service');
jest.mock('../../services/batch-service');
jest.mock('../../services/user-initialization-service');
jest.mock('../../services/notify-user');
jest.mock('../../services/s3-service');
jest.mock('../../services/aws-request');
jest.mock('../../services/configurationService');
jest.mock('../../services/data-model-service');
jest.mock('../../services/authorization-service');
jest.mock('../../services/qc-result-service');
jest.mock('../../utility/data-commons-remapper', () => ({
    getDataCommonsDisplayNamesForSubmission: jest.fn(submission => submission),
    getDataCommonsDisplayNamesForListSubmissions: jest.fn(res => res)
}));
jest.mock('../../utility/validation-handler');
jest.mock('../../verifier/user-info-verifier');
jest.mock('../../verifier/submission-verifier');
jest.mock('../../domain/history-event');
jest.mock('../../domain/user-scope');
jest.mock('../../prisma', () => ({
    log: {
        create: jest.fn()
    }
}));

const SubmissionDAO = require('../../dao/submission');
const ProgramDAO = require('../../dao/program');
const UserService = require('../../services/user');
const DataRecordService = require('../../services/data-record-service');
const BatchService = require('../../services/batch-service');
const UserInitializationService = require('../../services/user-initialization-service');
const NotifyUser = require('../../services/notify-user');
const S3Service = require('../../services/s3-service');
const AWSService = require('../../services/aws-request');
const ConfigurationService = require('../../services/configurationService');
const DataModelService = require('../../services/data-model-service');
const AuthorizationService = require('../../services/authorization-service');
const QcResultService = require('../../services/qc-result-service');
const { getDataCommonsDisplayNamesForSubmission } = require('../../utility/data-commons-remapper');
const { ValidationHandler } = require('../../utility/validation-handler');
const { verifySession } = require('../../verifier/user-info-verifier');

// Helper function to create complete mock UserScope
const createMockUserScope = (isNoneScope = false, isAllScope = false, isOwnScope = false, isStudyScope = false, isDCScope = false) => {
    return {
        isNoneScope: jest.fn().mockReturnValue(isNoneScope),
        isAllScope: jest.fn().mockReturnValue(isAllScope),
        isOwnScope: jest.fn().mockReturnValue(isOwnScope),
        isStudyScope: jest.fn().mockReturnValue(isStudyScope),
        isDCScope: jest.fn().mockReturnValue(isDCScope),
        isRoleScope: jest.fn().mockReturnValue(false),
        getRoleScope: jest.fn().mockReturnValue(null),
        getStudyScope: jest.fn().mockReturnValue(null),
        getDataCommonsScope: jest.fn().mockReturnValue(null),
        hasStudyValue: jest.fn().mockReturnValue(false),
        hasDCValue: jest.fn().mockReturnValue(false),
        hasAccessToStudy: jest.fn().mockReturnValue(false)
    };
};

// Helper function to create mock for _appendSubmissionRequestAndViewPermissions
const createMockAppendSubmissionRequestPermissions = () => {
    return jest.fn().mockImplementation((submissions) => Promise.resolve(
        Array.isArray(submissions)
            ? submissions.map(s => ({ ...s, canViewSubmissionRequest: false }))
            : { ...submissions, canViewSubmissionRequest: false }
    ));
};

describe('Submission Service - getSubmission', () => {
    let submissionService;
    let mockSubmissionDAO;
    let mockProgramDAO;
    let mockUserService;
    let mockDataRecordService;
    let mockBatchService;
    let mockUserInitializationService;
    let mockNotifyUser;
    let mockS3Service;
    let mockAWSService;
    let mockConfigurationService;
    let mockDataModelService;
    let mockAuthorizationService;

    const mockSubmission = {
        _id: 'sub-123',
        id: 'sub-123',
        name: 'Test Submission',
        status: NEW,
        studyID: 'study-123',
        programID: 'program-123',
        submitterID: 'user-123',
        bucketName: 'test-bucket',
        rootPath: 'test/path',
        dataFileSize: { size: 1024, formatted: '1 KB' },
        nodeCount: 5,
        archived: false,
        history: [
            { userID: 'user-123', userName: 'John Doe' },
            { userID: 'user-456', userName: 'Jane Smith' }
        ],
        study: {
            id: 'study-123',
            _id: 'study-123',
            studyName: 'Test Study',
            studyAbbreviation: 'TS'
        },
        organization: {
            id: 'program-123',
            name: 'Test Program',
            abbreviation: 'TP'
        }
    };

    const mockContext = {
        userInfo: {
            _id: 'user-123',
            role: ROLES.SUBMITTER,
            email: 'test@example.com'
        }
    };

    const mockParams = {
        _id: 'sub-123'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock DAOs
        mockSubmissionDAO = {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            findById: jest.fn()
        };

        mockProgramDAO = {
            findFirst: jest.fn(),
            findById: jest.fn()
        };

        // Setup mock services
        mockUserService = {
            getUserByID: jest.fn(),
            getUsersByIDs: jest.fn().mockResolvedValue([])
        };

        mockDataRecordService = {
            countNodesBySubmissionID: jest.fn()
        };

        mockBatchService = {
            findByID: jest.fn(),
            createBatch: jest.fn(),
            updateBatch: jest.fn()
        };

        mockUserInitializationService = {
            getMyUser: jest.fn()
        };

        mockNotifyUser = {
            sendEmail: jest.fn()
        };

        mockS3Service = {
            createPreSignedURL: jest.fn(),
            createDownloadSignedURL: jest.fn()
        };

        mockAWSService = {
            createTempCredentials: jest.fn()
        };

        mockConfigurationService = {
            getPBACDefaults: jest.fn(),
            retrieveCLIUploaderVersion: jest.fn(),
            getApplicationFormVersion: jest.fn(),
            isMaintenanceMode: jest.fn()
        };

        mockDataModelService = {
            getDataModelByDataCommonAndVersion: jest.fn()
        };

        mockAuthorizationService = {
            getUserScope: jest.fn()
        };

        // Create submission service instance
        submissionService = new Submission(
            {}, // logCollection
            {}, // submissionCollection
            mockBatchService,
            mockUserService,
            {}, // organizationService
            mockNotifyUser,
            mockDataRecordService,
            jest.fn(), // fetchDataModelInfo
            mockAWSService,
            'metadata-queue',
            mockS3Service,
            {}, // emailParams
            ['test-commons'], // dataCommonsList
            ['hidden-commons'], // hiddenDataCommonsList
            {}, // validationCollection
            'sqs-loader-queue',
            {}, // qcResultsService
            {}, // uploaderCLIConfigs
            'submission-bucket',
            mockConfigurationService,
            {}, // uploadingMonitor
            {}, // dataCommonsBucketMap
            mockAuthorizationService,
            mockDataModelService,
            {} // dataRecordsCollection
        );

        // Set mock DAOs
        submissionService.submissionDAO = mockSubmissionDAO;
        submissionService.programDAO = mockProgramDAO;
        submissionService.userService = mockUserService;
        submissionService.dataRecordService = mockDataRecordService;

        // Mock the _findByID method
        submissionService._findByID = jest.fn();
        submissionService._getUserScope = jest.fn();
        submissionService._getS3DirectorySize = jest.fn();
        submissionService._getEveryReminderQuery = jest.fn();

        // Mock the data commons remapper
        getDataCommonsDisplayNamesForSubmission.mockReturnValue({
            ...mockSubmission,
            dataCommonsDisplayName: 'Test Commons Display Name'
        });

        // Mock verifySession
        verifySession.mockReturnValue({
            verifyInitialized: jest.fn()
        });
    });

    describe('getSubmission', () => {
        it('should successfully get a submission with all related data', async () => {
            // Setup mocks
            const submissionWithDifferentSize = {
                ...mockSubmission,
                dataFileSize: { size: 512, formatted: '512 B' } // Different size to trigger update
            };
            submissionService._findByID.mockResolvedValue(submissionWithDifferentSize);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithDifferentSize);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(submissionService._findByID).toHaveBeenCalledWith('sub-123');
            expect(submissionService._getUserScope).toHaveBeenCalledWith(
                mockContext.userInfo,
                expect.any(String),
                submissionWithDifferentSize
            );
            expect(submissionService._getS3DirectorySize).toHaveBeenCalledWith(
                'test-bucket',
                'test/path/file/'
            );
            // The method calls update twice - once for dataFileSize and once for accessedAt
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    dataFileSize: { size: 1024, formatted: '1 KB' },
                    updatedAt: expect.any(Date)
                })
            );
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    accessedAt: expect.any(Date),
                    reminderFlag: true
                })
            );
            expect(getDataCommonsDisplayNamesForSubmission).toHaveBeenCalledWith(submissionWithDifferentSize);
            expect(result).toHaveProperty('dataCommonsDisplayName', 'Test Commons Display Name');
        });

        it('should throw error when submission is not found', async () => {
            // Setup mocks
            submissionService._findByID.mockResolvedValue(null);

            // Execute and verify
            await expect(submissionService.getSubmission(mockParams, mockContext))
                .rejects.toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        });

        it('should throw error when user lacks permission', async () => {
            // Setup mocks
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(true)); // isNoneScope = true for no permission

            // Execute and verify
            await expect(submissionService.getSubmission(mockParams, mockContext))
                .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });

        it('should update data file size when it changes', async () => {
            // Setup mocks
            const submissionWithDifferentSize = {
                ...mockSubmission,
                dataFileSize: { size: 512, formatted: '512 B' }
            };
            submissionService._findByID.mockResolvedValue(submissionWithDifferentSize);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithDifferentSize);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    dataFileSize: { size: 1024, formatted: '1 KB' },
                    updatedAt: expect.any(Date)
                })
            );
            expect(result.dataFileSize).toEqual({ size: 1024, formatted: '1 KB' });
        });

        it('should not update data file size when it has not changed', async () => {
            // Setup mocks
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    dataFileSize: expect.any(Object)
                })
            );
        });

        it('should fetch other submissions for the same study', async () => {
            // Setup mocks
            const otherSubmissions = [
                { _id: 'sub-456', status: IN_PROGRESS },
                { _id: 'sub-789', status: SUBMITTED }
            ];
            const submissionWithStudyID = {
                ...mockSubmission,
                studyID: 'study-123'
            };
            submissionService._findByID.mockResolvedValue(submissionWithStudyID);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithStudyID);
            mockSubmissionDAO.findMany.mockResolvedValue(otherSubmissions);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Mock the data commons remapper to return the submission with populated otherSubmissions
            const submissionWithOtherSubs = {
                ...submissionWithStudyID,
                otherSubmissions: JSON.stringify({
                    [IN_PROGRESS]: ['sub-456'],
                    [SUBMITTED]: ['sub-789'],
                    [RELEASED]: [],
                    [REJECTED]: [],
                    [WITHDRAWN]: []
                })
            };
            getDataCommonsDisplayNamesForSubmission.mockReturnValue({
                ...submissionWithOtherSubs,
                dataCommonsDisplayName: 'Test Commons Display Name'
            });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockSubmissionDAO.findMany).toHaveBeenCalledWith({
                studyID: 'study-123',
                status: { in: [IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN] },
                NOT: { id: 'sub-123' }
            });
            expect(result.otherSubmissions).toBeDefined();
            const parsedOtherSubs = JSON.parse(result.otherSubmissions);
            expect(parsedOtherSubs[IN_PROGRESS]).toContain('sub-456');
            expect(parsedOtherSubs[SUBMITTED]).toContain('sub-789');
            expect(parsedOtherSubs[RELEASED]).toEqual([]);
            expect(parsedOtherSubs[REJECTED]).toEqual([]);
            expect(parsedOtherSubs[WITHDRAWN]).toEqual([]);
        });

        it('should update node count when it changes', async () => {
            // Setup mocks
            const submissionWithDifferentNodeCount = {
                ...mockSubmission,
                nodeCount: 3
            };
            submissionService._findByID.mockResolvedValue(submissionWithDifferentNodeCount);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithDifferentNodeCount);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    updatedAt: expect.any(Date),
                    nodeCount: 5
                })
            );
            expect(result.nodeCount).toBe(5);
        });

        it('should not update node count for archived submissions', async () => {
            // Setup mocks
            const archivedSubmission = {
                ...mockSubmission,
                archived: true
            };
            submissionService._findByID.mockResolvedValue(archivedSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(archivedSubmission);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockDataRecordService.countNodesBySubmissionID).not.toHaveBeenCalled();
            expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    nodeCount: expect.any(Number)
                })
            );
        });

        it('should populate user names in history efficiently', async () => {
            // Setup mocks
            const submissionWithHistory = {
                ...mockSubmission,
                history: [
                    { userID: 'user-123', userName: 'John Doe' },
                    { userID: 'user-456', userName: null },
                    { userID: 'user-789', userName: null }
                ]
            };
            submissionService._findByID.mockResolvedValue(submissionWithHistory);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithHistory);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUsersByIDs.mockResolvedValue([
                {
                    _id: 'user-456',
                    firstName: 'Jane',
                    lastName: 'Smith'
                },
                {
                    _id: 'user-789',
                    firstName: 'Bob',
                    lastName: 'Johnson'
                }
            ]);
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Mock the data commons remapper to return the submission with populated history
            const submissionWithPopulatedHistory = {
                ...submissionWithHistory,
                history: [
                    { userID: 'user-123', userName: 'John Doe' },
                    { userID: 'user-456', userName: 'Jane Smith' },
                    { userID: 'user-789', userName: 'Bob Johnson' }
                ]
            };
            getDataCommonsDisplayNamesForSubmission.mockReturnValue({
                ...submissionWithPopulatedHistory,
                dataCommonsDisplayName: 'Test Commons Display Name'
            });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockUserService.getUsersByIDs).toHaveBeenCalledTimes(1);
            expect(mockUserService.getUsersByIDs).toHaveBeenCalledWith(['user-456', 'user-789']);
            
            // Verify that the history was properly populated
            expect(result.history).toBeDefined();
            expect(result.history).toHaveLength(3);
            expect(result.history[0].userName).toBe('John Doe'); // Already had userName
            expect(result.history[1].userName).toBe('Jane Smith'); // Populated from user-456
            expect(result.history[2].userName).toBe('Bob Johnson'); // Populated from user-789
        });

        it('should update accessedAt for submitter users', async () => {
            // Setup mocks
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    accessedAt: expect.any(Date),
                    reminderFlag: true
                })
            );
        });

        it('should not update accessedAt for non-submitter users', async () => {
            // Setup mocks
            const nonSubmitterContext = {
                userInfo: {
                    _id: 'user-999',
                    role: ROLES.ADMIN,
                    email: 'admin@example.com'
                }
            };
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });

            // Execute
            const result = await submissionService.getSubmission(mockParams, nonSubmitterContext);

            // Verify
            expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    accessedAt: expect.any(Date)
                })
            );
        });

        it('should handle missing organization gracefully', async () => {
            // Setup mocks
            const submissionWithoutOrg = {
                ...mockSubmission,
                organization: null
            };
            submissionService._findByID.mockResolvedValue(submissionWithoutOrg);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true for admin users
            submissionService._getS3DirectorySize.mockResolvedValue({ size: 1024, formatted: '1 KB' });
            mockSubmissionDAO.update.mockResolvedValue(submissionWithoutOrg);
            mockSubmissionDAO.findMany.mockResolvedValue([]);
            mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
            mockUserService.getUserByID.mockResolvedValue({
                _id: 'user-456',
                firstName: 'Jane',
                lastName: 'Smith'
            });
            submissionService._getEveryReminderQuery.mockReturnValue({ reminderFlag: true });
            mockProgramDAO.findById.mockResolvedValue({
                id: 'program-123',
                name: 'Test Program',
                abbreviation: 'TP'
            });

            // Execute
            const result = await submissionService.getSubmission(mockParams, mockContext);

            // Verify
            expect(mockProgramDAO.findById).toHaveBeenCalledWith('program-123');
            expect(result.organization).toBeDefined();
            expect(result.organization.name).toBe('Test Program');
        });

        it('should handle errors gracefully', async () => {
            // Setup mocks
            submissionService._findByID.mockRejectedValue(new Error('Database error'));

            // Execute and verify
            await expect(submissionService.getSubmission(mockParams, mockContext))
                .rejects.toThrow('Database error');
        });
    });

    describe('submissionCrossValidationResults', () => {
        test('should pass dataCommons parameter for cross validation scope filtering', async () => {
            // Mock data
            const mockParams = {
                submissionID: 'submission-123',
                nodeTypes: ['case'],
                batchIDs: ['batch-1'],
                severities: 'Error',
                first: 10,
                offset: 0,
                orderBy: 'validatedDate',
                sortDirection: 'DESC'
            };

            const mockContext = {
                userInfo: {
                    _id: 'user-123',
                    role: ROLES.DATA_COMMONS_PERSONNEL,
                    studies: ['study-123'],
                    dataCommons: ['test-data-commons']
                }
            };

            const mockSubmission = {
                _id: 'submission-123',
                dataCommons: 'test-data-commons',
                studyID: 'study-123'
            };

            const mockCrossValidationResults = {
                results: [],
                total: 0
            };

            // Setup mocks
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true
            submissionService.dataRecordDAO.submissionCrossValidationResults.mockResolvedValue(mockCrossValidationResults);

            // Execute
            const result = await submissionService.submissionCrossValidationResults(mockParams, mockContext);

            // Verify
            expect(submissionService.dataRecordDAO.submissionCrossValidationResults).toHaveBeenCalledWith(
                'submission-123',
                ['case'],
                ['batch-1'],
                'Error',
                10,
                0,
                'validatedDate',
                'DESC',
                'test-data-commons' // dataCommons parameter should be passed
            );
            expect(result).toEqual(mockCrossValidationResults);
        });

        test('should handle missing dataCommons gracefully', async () => {
            // Mock data
            const mockParams = {
                submissionID: 'submission-123'
            };

            const mockContext = {
                userInfo: {
                    _id: 'user-123',
                    role: ROLES.DATA_COMMONS_PERSONNEL
                }
            };

            const mockSubmission = {
                _id: 'submission-123',
                dataCommons: null // No dataCommons
            };

            const mockCrossValidationResults = {
                results: [],
                total: 0
            };

            // Setup mocks
            submissionService._findByID.mockResolvedValue(mockSubmission);
            submissionService._getUserScope.mockResolvedValue(createMockUserScope(false, true)); // isAllScope = true
            submissionService.dataRecordDAO.submissionCrossValidationResults.mockResolvedValue(mockCrossValidationResults);

            // Execute
            const result = await submissionService.submissionCrossValidationResults(mockParams, mockContext);

            // Verify
            expect(submissionService.dataRecordDAO.submissionCrossValidationResults).toHaveBeenCalledWith(
                'submission-123',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                null // dataCommons should be null
            );
            expect(result).toEqual(mockCrossValidationResults);
        });
    });

    describe('deleteDataRecords', () => {
        let mockQcResultsService;
        const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');

        beforeEach(() => {
            jest.clearAllMocks();

            mockQcResultsService = {
                deleteQCResultBySubmissionID: jest.fn()
            };

            // Update submissionService to include qcResultsService
            submissionService.qcResultsService = mockQcResultsService;
            submissionService.sqsLoaderQueue = 'test-queue';

            // Mock additional methods needed for deleteDataRecords
            submissionService._isCollaborator = jest.fn();
            submissionService._getAllSubmissionDataFiles = jest.fn();
            submissionService._getS3DirectorySize = jest.fn();
            submissionService._logDataRecord = jest.fn();
            submissionService._requestDeleteDataRecords = jest.fn();
            submissionService._getExistingDataFiles = jest.fn();
            submissionService._deleteDataFiles = jest.fn();
            submissionService._prepareUpdateData = jest.fn((data) => data);

            // Mock S3Service methods
            mockS3Service.deleteFile = jest.fn();
            mockS3Service.deleteDirectory = jest.fn();
            mockS3Service.listFile = jest.fn();
            mockS3Service.listFileInDir = jest.fn();
            submissionService.s3Service = mockS3Service;

            // Mock verifySession
            verifySession.mockReturnValue({
                verifyInitialized: jest.fn()
            });
        });

        describe('validation and error cases', () => {
            it('should throw error when submission does not exist', async () => {
                submissionService._findByID.mockResolvedValue(null);

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'non-existent', nodeType: VALIDATION.TYPES.DATA_FILE },
                    mockContext
                )).rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
            });

            it('should throw error when submission is released', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: RELEASED
                };
                submissionService._findByID.mockResolvedValue(mockSubmission);

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE },
                    mockContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_SUBMISSION_STATUS);
            });

            it('should throw error when nodeIDs array exceeds 2000 items', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };
                const largeArray = Array(2001).fill('file.txt');
                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE, nodeIDs: largeArray },
                    mockContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_DATA_RECORDS_ARRAY_LENGTH);
            });

            it('should throw error when exclusiveIDs array exceeds 2000 items', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };
                const largeArray = Array(2001).fill('file.txt');
                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE, deleteAll: true, exclusiveIDs: largeArray },
                    mockContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_DATA_RECORDS_ARRAY_LENGTH);
            });

            it('should throw error when user lacks permission', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user'
                };
                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(false);

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE },
                    mockContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION);
            });
        });

        describe('collaborator permission path', () => {
            it('should allow collaborator with study scope and study access to delete data records', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt']
                ]);
                const deletedFiles = ['file1.txt'];
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'study-123' }]
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => true,
                    isDCScope: () => false,
                    isAllScope: () => false,
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    collaboratorContext
                );

                expect(submissionService._isCollaborator).toHaveBeenCalledWith(
                    collaboratorContext.userInfo,
                    mockSubmission
                );
                expect(submissionService._deleteDataFiles).toHaveBeenCalled();
                expect(result.message).toContain('1 nodes deleted');
            });

            it('should throw error when collaborator has study scope but no study access', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123'
                };
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'different-study' }] // Different study
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => true,
                    isDCScope: () => false,
                    isAllScope: () => false,
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE },
                    collaboratorContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION);
            });

            it('should throw error when user is collaborator but has none scope', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123'
                };
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'study-123' }]
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false,
                    isNoneScope: () => true // None scope
                });
                submissionService._isCollaborator.mockReturnValue(true);

                await expect(submissionService.deleteDataRecords(
                    { submissionID: 'sub-123', nodeType: VALIDATION.TYPES.DATA_FILE },
                    collaboratorContext
                )).rejects.toThrow(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION);
            });

            it('should allow collaborator with OWN scope and study access to delete data records', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt']
                ]);
                const deletedFiles = ['file1.txt'];
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'study-123' }]
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true, // OWN scope
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false,
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    collaboratorContext
                );

                expect(submissionService._deleteDataFiles).toHaveBeenCalled();
                expect(result.message).toContain('1 nodes deleted');
            });

            it('should allow collaborator with DC scope and study access to delete data records', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt']
                ]);
                const deletedFiles = ['file1.txt'];
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'study-123' }]
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => true, // DC scope
                    isAllScope: () => false,
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    collaboratorContext
                );

                expect(submissionService._deleteDataFiles).toHaveBeenCalled();
                expect(result.message).toContain('1 nodes deleted');
            });

            it('should allow collaborator with ALL scope and study access to delete data records', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt']
                ]);
                const deletedFiles = ['file1.txt'];
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'study-123' }]
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => true, // ALL scope
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    collaboratorContext
                );

                expect(submissionService._deleteDataFiles).toHaveBeenCalled();
                expect(result.message).toContain('1 nodes deleted');
            });

            it('should allow collaborator with "All" study access to delete data records', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'other-user',
                    studyID: 'study-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt']
                ]);
                const deletedFiles = ['file1.txt'];
                const collaboratorContext = {
                    userInfo: {
                        _id: 'collaborator-123',
                        role: ROLES.SUBMITTER,
                        email: 'collaborator@example.com',
                        studies: [{ _id: 'All' }] // All studies access
                    }
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => false,
                    isStudyScope: () => true,
                    isDCScope: () => false,
                    isAllScope: () => false,
                    isNoneScope: () => false
                });
                submissionService._isCollaborator.mockReturnValue(true);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    collaboratorContext
                );

                expect(submissionService._deleteDataFiles).toHaveBeenCalled();
                expect(result.message).toContain('1 nodes deleted');
            });
        });

        describe('normal deletion path (deleteAll=false)', () => {
            it('should delete data files successfully', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt'],
                    ['file2.txt', 'test/path/file/file2.txt']
                ]);
                const deletedFiles = ['file1.txt', 'file2.txt'];

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deletedFiles);
                submissionService._getAllSubmissionDataFiles.mockResolvedValue([]);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt', 'file2.txt']
                    },
                    mockContext
                );

                expect(submissionService._getExistingDataFiles).toHaveBeenCalledWith(
                    ['file1.txt', 'file2.txt'],
                    mockSubmission,
                    false,
                    []
                );
                expect(submissionService._deleteDataFiles).toHaveBeenCalledWith(
                    existingFilesMap,
                    mockSubmission,
                    false,
                    []
                );
                expect(mockQcResultsService.deleteQCResultBySubmissionID).toHaveBeenCalled();
                expect(result.message).toContain('2 nodes deleted');
            });

            it('should return error when no files exist', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };
                const emptyFilesMap = new Map();

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._getExistingDataFiles.mockResolvedValue(emptyFilesMap);
                ValidationHandler.handle = jest.fn((error) => ({ success: false, error }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        nodeIDs: ['file1.txt']
                    },
                    mockContext
                );

                expect(result.success).toBe(false);
                expect(submissionService._deleteDataFiles).not.toHaveBeenCalled();
            });
        });

        describe('deleteAll=true without exclusiveIDs', () => {
            it('should delete all data files', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const deleteResult = { deleteAll: true, count: 5 };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._deleteDataFiles.mockResolvedValue(deleteResult);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        deleteAll: true,
                        exclusiveIDs: []
                    },
                    mockContext
                );

                expect(mockQcResultsService.deleteQCResultBySubmissionID).toHaveBeenCalledWith(
                    'sub-123',
                    VALIDATION.TYPES.DATA_FILE,
                    [],
                    true,
                    []
                );
                expect(submissionService._deleteDataFiles).toHaveBeenCalledWith(
                    expect.any(Map),
                    mockSubmission,
                    true,
                    []
                );
                expect(result.message).toBe('5 nodes deleted');
            });
        });

        describe('deleteAll=true with exclusiveIDs', () => {
            it('should delete all files except exclusiveIDs', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123',
                    bucketName: 'test-bucket',
                    rootPath: 'test/path',
                    fileErrors: []
                };
                const allFiles = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt'];
                const exclusiveIDs = ['file3.txt', 'file4.txt'];
                const filesToDelete = ['file1.txt', 'file2.txt'];
                const existingFilesMap = new Map([
                    ['file1.txt', 'test/path/file/file1.txt'],
                    ['file2.txt', 'test/path/file/file2.txt']
                ]);
                const deleteResult = { deleteAll: true, count: 2, excludedCount: 2 };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._getAllSubmissionDataFiles.mockResolvedValue(allFiles);
                submissionService._getExistingDataFiles.mockResolvedValue(existingFilesMap);
                submissionService._deleteDataFiles.mockResolvedValue(deleteResult);
                submissionService._getS3DirectorySize.mockResolvedValue({ size: 0 });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
                ValidationHandler.success = jest.fn((msg) => ({ success: true, message: msg }));

                const result = await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: VALIDATION.TYPES.DATA_FILE,
                        deleteAll: true,
                        exclusiveIDs: exclusiveIDs
                    },
                    mockContext
                );

                expect(mockQcResultsService.deleteQCResultBySubmissionID).toHaveBeenCalledWith(
                    'sub-123',
                    VALIDATION.TYPES.DATA_FILE,
                    [],
                    true,
                    exclusiveIDs
                );
                expect(submissionService._getAllSubmissionDataFiles).toHaveBeenCalled();
                expect(submissionService._getExistingDataFiles).toHaveBeenCalledWith(
                    filesToDelete,
                    mockSubmission,
                    true,
                    exclusiveIDs
                );
                expect(result.message).toContain('2 nodes deleted');
                expect(result.message).toContain('excluding 2 nodes');
            });
        });

        describe('non-DATA_FILE nodeType', () => {
            it('should send SQS message for metadata deletion', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._requestDeleteDataRecords.mockResolvedValue({ success: true });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

                await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        nodeIDs: ['node1', 'node2']
                    },
                    mockContext
                );

                expect(submissionService._requestDeleteDataRecords).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: expect.stringContaining('Delete Metadata'),
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        deleteAll: false,
                        nodeIDs: ['node1', 'node2'],
                        exclusiveIDs: []
                    }),
                    'test-queue',
                    'sub-123',
                    'sub-123'
                );
            });

            it('should send SQS message with deleteAll for metadata (no exclusives)', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._requestDeleteDataRecords.mockResolvedValue({ success: true });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

                await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        deleteAll: true,
                        exclusiveIDs: []
                    },
                    mockContext
                );

                expect(submissionService._requestDeleteDataRecords).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: expect.stringContaining('Delete Metadata'),
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        deleteAll: true,
                        nodeIDs: [],
                        exclusiveIDs: []
                    }),
                    'test-queue',
                    'sub-123',
                    'sub-123'
                );
            });

            it('should send SQS message with deleteAll for metadata (with exclusives)', async () => {
                const mockSubmission = {
                    _id: 'sub-123',
                    status: NEW,
                    submitterID: 'user-123'
                };

                submissionService._findByID.mockResolvedValue(mockSubmission);
                submissionService._getUserScope.mockResolvedValue({
                    isOwnScope: () => true,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isAllScope: () => false
                });
                submissionService._requestDeleteDataRecords.mockResolvedValue({ success: true });
                mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

                await submissionService.deleteDataRecords(
                    {
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        deleteAll: true,
                        exclusiveIDs: ['node1']
                    },
                    mockContext
                );

                expect(submissionService._requestDeleteDataRecords).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: expect.stringContaining('Delete Metadata'),
                        submissionID: 'sub-123',
                        nodeType: 'Subject',
                        deleteAll: true,
                        nodeIDs: [],
                        exclusiveIDs: ['node1']
                    }),
                    'test-queue',
                    'sub-123',
                    'sub-123'
                );
            });
        });
    });

    describe('_deleteDataFiles', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Add missing S3Service methods
            mockS3Service.deleteFile = jest.fn();
            mockS3Service.deleteDirectory = jest.fn();
            mockS3Service.listFile = jest.fn();
            mockS3Service.listFileInDir = jest.fn();
            submissionService.s3Service = mockS3Service;
            submissionService.submissionDAO = mockSubmissionDAO;
            submissionService._prepareUpdateData = jest.fn((data) => data);
        });

        it('should delete directory when deleteAll=true and no exclusiveIDs', async () => {
            const mockSubmission = {
                _id: 'sub-123',
                bucketName: 'test-bucket',
                rootPath: 'test/path',
                fileErrors: []
            };
            // Mock listFileInDir to return some files for counting
            const mockFiles = [
                { Key: 'test/path/file/file1.txt' },
                { Key: 'test/path/file/file2.txt' },
                { Key: 'test/path/file/file3.txt' }
            ];
            mockS3Service.listFileInDir.mockResolvedValue(mockFiles);
            mockS3Service.deleteDirectory.mockResolvedValue(true);
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

            const result = await submissionService._deleteDataFiles(
                new Map(),
                mockSubmission,
                true,
                []
            );

            expect(mockS3Service.listFileInDir).toHaveBeenCalledWith(
                'test-bucket',
                'test/path/file/'
            );
            expect(mockS3Service.deleteDirectory).toHaveBeenCalledWith(
                'test-bucket',
                'test/path/file/'
            );
            expect(result).toEqual({ deleteAll: true, count: 3 });
        });

        it('should delete files in batches when deleteAll=true with exclusiveIDs', async () => {
            const mockSubmission = {
                _id: 'sub-123',
                bucketName: 'test-bucket',
                rootPath: 'test/path',
                fileErrors: []
            };
            const exclusiveIDs = ['file3.txt'];
            // existingFilesMap already contains only non-exclusive files (filtering happens in caller)
            const existingFilesMap = new Map([
                ['file1.txt', 'test/path/file/file1.txt'],
                ['file2.txt', 'test/path/file/file2.txt']
            ]);

            mockS3Service.deleteFile.mockResolvedValue({});
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

            const result = await submissionService._deleteDataFiles(
                existingFilesMap,
                mockSubmission,
                true,
                exclusiveIDs
            );

            // _getAllSubmissionDataFiles is no longer called - existingFiles Map is used directly
            expect(mockS3Service.deleteFile).toHaveBeenCalledTimes(2);
            expect(result.deleteAll).toBe(true);
            expect(result.excludedCount).toBe(1);
        });

        it('should handle normal deletion path', async () => {
            const mockSubmission = {
                _id: 'sub-123',
                bucketName: 'test-bucket',
                rootPath: 'test/path',
                fileErrors: []
            };
            const existingFilesMap = new Map([
                ['file1.txt', 'test/path/file/file1.txt'],
                ['file2.txt', 'test/path/file/file2.txt']
            ]);
            mockS3Service.deleteFile.mockResolvedValue({});
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

            const result = await submissionService._deleteDataFiles(
                existingFilesMap,
                mockSubmission,
                false,
                []
            );

            expect(mockS3Service.deleteFile).toHaveBeenCalledTimes(2);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(2);
        });

        it('should reset deletingData flag in finally block even on error', async () => {
            const mockSubmission = {
                _id: 'sub-123',
                bucketName: 'test-bucket',
                rootPath: 'test/path',
                fileErrors: []
            };
            mockS3Service.deleteDirectory.mockRejectedValue(new Error('S3 error'));
            mockSubmissionDAO.update.mockResolvedValue(mockSubmission);

            await expect(submissionService._deleteDataFiles(
                new Map(),
                mockSubmission,
                true,
                []
            )).rejects.toThrow('S3 error');

            // Verify deletingData was reset
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({ deletingData: false })
            );
        });
    });

    describe('_getExistingDataFiles', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Add missing S3Service methods
            mockS3Service.deleteFile = jest.fn();
            mockS3Service.deleteDirectory = jest.fn();
            mockS3Service.listFile = jest.fn();
            mockS3Service.listFileInDir = jest.fn();
            submissionService.s3Service = mockS3Service;
        });

        it('should return empty Map when deleteAll=true and no exclusiveIDs', async () => {
            const mockSubmission = {
                bucketName: 'test-bucket',
                rootPath: 'test/path'
            };

            const result = await submissionService._getExistingDataFiles(
                ['file1.txt'],
                mockSubmission,
                true,
                []
            );

            expect(result).toEqual(new Map());
            expect(mockS3Service.listFile).not.toHaveBeenCalled();
        });

        it('should filter exclusiveIDs when deleteAll=true with exclusiveIDs', async () => {
            const mockSubmission = {
                bucketName: 'test-bucket',
                rootPath: 'test/path'
            };
            // fileNames should already be filtered by caller (exclusiveIDs filtering moved to caller)
            const fileNames = ['file1.txt', 'file2.txt'];
            const exclusiveIDs = ['file3.txt'];
            mockS3Service.listFile.mockResolvedValue({
                Contents: [
                    { Key: 'test/path/file/file1.txt' },
                    { Key: 'test/path/file/file2.txt' }
                ]
            });

            const result = await submissionService._getExistingDataFiles(
                fileNames,
                mockSubmission,
                true,
                exclusiveIDs
            );

            expect(mockS3Service.listFile).toHaveBeenCalledTimes(2);
            expect(result.size).toBe(2);
            expect(result.has('file1.txt')).toBe(true);
            expect(result.has('file2.txt')).toBe(true);
            expect(result.has('file3.txt')).toBe(false);
        });

        it('should return empty Map when no files to check', async () => {
            const mockSubmission = {
                bucketName: 'test-bucket',
                rootPath: 'test/path'
            };

            const result = await submissionService._getExistingDataFiles(
                [],
                mockSubmission,
                false,
                []
            );

            expect(result).toEqual(new Map());
        });
    });

    describe('_logDataRecord', () => {
        let prisma;
        
        beforeEach(() => {
            jest.clearAllMocks();
            prisma = require('../../prisma');
            // Use the existing mock from jest.mock, just reset and configure it
            prisma.log.create.mockClear();
            prisma.log.create.mockResolvedValue({ id: 'log-123' });
        });

        it('should handle array input', async () => {
            const mockUserInfo = {
                _id: 'user-123',
                email: 'test@example.com',
                firstName: 'Test',
                lastName: 'User'
            };
            const nodeIDs = ['file1.txt', 'file2.txt'];

            await submissionService._logDataRecord(
                mockUserInfo,
                'sub-123',
                'data file',
                nodeIDs
            );

            expect(prisma.log.create).toHaveBeenCalled();
            const callArgs = prisma.log.create.mock.calls[0][0];
            // Verify the call structure: prisma.log.create({ data: logData })
            // The callArgs should be { data: { userID, userEmail, userName, eventType, submissionID, ... } }
            expect(callArgs).toBeDefined();
            expect(callArgs).toHaveProperty('data');
            expect(callArgs.data).toBeDefined();
            expect(callArgs.data.submissionID).toBe('sub-123');
            expect(callArgs.data.userID).toBe('user-123');
            expect(callArgs.data.eventType).toBe('Delete_Data');
        });

        it('should handle string input (deleteAll summary)', async () => {
            const mockUserInfo = {
                _id: 'user-123',
                email: 'test@example.com',
                firstName: 'Test',
                lastName: 'User'
            };

            await submissionService._logDataRecord(
                mockUserInfo,
                'sub-123',
                'data file',
                'deleteAll'
            );

            expect(prisma.log.create).toHaveBeenCalled();
        });
    });
});

describe('Submission Service - listSubmissions', () => {
    let submissionService;
    let mockSubmissionDAO;
    let mockContext;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock SubmissionDAO
        mockSubmissionDAO = {
            listSubmissions: jest.fn().mockResolvedValue({
                submissions: [],
                total: 0,
                dataCommons: [],
                submitterNames: [],
                organizations: [],
                statuses: () => []
            })
        };

        // Mock verifySession
        verifySession.mockReturnValue({
            verifyInitialized: jest.fn().mockReturnValue(true)
        });

        // Create submission service with dataCommonsList and hiddenDataCommonsList
        const dataCommonsList = ['CDS', 'ICDC', 'CTDC', 'Hidden Model'];
        const hiddenDataCommonsList = ['Hidden Model'];

        submissionService = new Submission(
            {}, // logCollection
            {}, // submissionCollection
            {}, // batchService
            {}, // userService
            {}, // organizationService
            {}, // notificationService
            {}, // dataRecordService
            jest.fn(), // fetchDataModelInfo
            {}, // awsService
            'metadata-queue', // metadataQueueName
            {}, // s3Service
            {}, // emailParams
            dataCommonsList,
            hiddenDataCommonsList,
            {}, // validationCollection
            'sqs-loader-queue', // sqsLoaderQueue
            {}, // qcResultsService
            {}, // uploaderCLIConfigs
            'submission-bucket', // submissionBucketName
            {}, // configurationService
            {}, // uploadingMonitor
            {}, // dataCommonsBucketMap
            {}, // authorizationService
            {}, // dataModelService
            {} // dataRecordsCollection
        );

        // Override the submissionDAO with our mock
        submissionService.submissionDAO = mockSubmissionDAO;

        // Mock _getUserScope to return ALL scope
        submissionService._getUserScope = jest.fn().mockResolvedValue(
            createMockUserScope(false, true, false, false, false)
        );

        // Mock _appendSubmissionRequestAndViewPermissions to return submissions with canViewSubmissionRequest
        submissionService._appendSubmissionRequestAndViewPermissions = createMockAppendSubmissionRequestPermissions();

        mockContext = {
            userInfo: {
                _id: 'user-123',
                email: 'test@example.com',
                role: 'Admin'
            }
        };
    });

    it('should not return hidden data commons in the dataCommons list', async () => {
        await submissionService.listSubmissions({}, mockContext);

        // Verify listSubmissions was called with filtered data commons (excluding hidden)
        expect(mockSubmissionDAO.listSubmissions).toHaveBeenCalledWith(
            mockContext.userInfo,
            expect.anything(), // userScope
            {}, // params
            expect.arrayContaining(['CDS', 'ICDC', 'CTDC'])
        );

        // Verify hidden model is NOT in the data commons list
        const calledDataCommons = mockSubmissionDAO.listSubmissions.mock.calls[0][3];
        expect(calledDataCommons).not.toContain('Hidden Model');
        expect(calledDataCommons).toHaveLength(3);
    });

    it('should pass all non-hidden data commons when none are hidden', async () => {
        // Create service with no hidden data commons
        const dataCommonsListNoHidden = ['CDS', 'ICDC', 'CTDC'];
        const emptyHiddenList = [];

        const serviceNoHidden = new Submission(
            {}, {}, {}, {}, {}, {}, {}, jest.fn(), {}, 'queue', {}, {},
            dataCommonsListNoHidden, emptyHiddenList,
            {}, 'sqs', {}, {}, 'bucket', {}, {}, {}, {}, {}, {}
        );
        serviceNoHidden.submissionDAO = mockSubmissionDAO;
        serviceNoHidden._getUserScope = jest.fn().mockResolvedValue(
            createMockUserScope(false, true, false, false, false)
        );
        serviceNoHidden._appendSubmissionRequestAndViewPermissions = createMockAppendSubmissionRequestPermissions();

        await serviceNoHidden.listSubmissions({}, mockContext);

        const calledDataCommons = mockSubmissionDAO.listSubmissions.mock.calls[0][3];
        expect(calledDataCommons).toEqual(['CDS', 'ICDC', 'CTDC']);
        expect(calledDataCommons).toHaveLength(3);
    });

    it('should return empty data commons list when all are hidden', async () => {
        // Create service where all data commons are hidden
        const allDataCommons = ['CDS', 'ICDC'];
        const allHidden = ['CDS', 'ICDC'];

        const serviceAllHidden = new Submission(
            {}, {}, {}, {}, {}, {}, {}, jest.fn(), {}, 'queue', {}, {},
            allDataCommons, allHidden,
            {}, 'sqs', {}, {}, 'bucket', {}, {}, {}, {}, {}, {}
        );
        serviceAllHidden.submissionDAO = mockSubmissionDAO;
        serviceAllHidden._getUserScope = jest.fn().mockResolvedValue(
            createMockUserScope(false, true, false, false, false)
        );
        serviceAllHidden._appendSubmissionRequestAndViewPermissions = createMockAppendSubmissionRequestPermissions();

        await serviceAllHidden.listSubmissions({}, mockContext);

        const calledDataCommons = mockSubmissionDAO.listSubmissions.mock.calls[0][3];
        expect(calledDataCommons).toEqual([]);
        expect(calledDataCommons).toHaveLength(0);
    });
});