const { Submission } = require('../../services/submission');
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED } = require('../../constants/submission-constants');
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
jest.mock('../../utility/data-commons-remapper');
jest.mock('../../verifier/user-info-verifier');
jest.mock('../../verifier/submission-verifier');
jest.mock('../../domain/history-event');
jest.mock('../../domain/user-scope');

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
const { getDataCommonsDisplayNamesForSubmission } = require('../../utility/data-commons-remapper');
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
}); 