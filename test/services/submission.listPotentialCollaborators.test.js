const { Submission } = require('../../services/submission');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { ERROR } = require('../../constants/error-constants');

// Mock the user-info-verifier
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));

// Mock the data-commons-remapper utility
jest.mock('../../utility/data-commons-remapper', () => ({
    getDataCommonsDisplayNamesForUser: jest.fn((user) => ({
        ...user,
        dataCommonsDisplayNames: user.dataCommons ? user.dataCommons.map(dc => `${dc}_display`) : []
    }))
}));

describe('Submission.listPotentialCollaborators', () => {
    let submissionService;
    let mockSubmissionCollection, mockLogCollection, mockBatchService, mockUserService, 
        mockOrganizationService, mockNotificationService, mockDataRecordService, 
        mockFetchDataModelInfo, mockAwsService, mockMetadataQueueName, mockS3Service, 
        mockEmailParams, mockDataCommonsList, mockHiddenDataCommonsList, 
        mockValidationCollection, mockSqsLoaderQueue, mockQcResultsService, 
        mockUploaderCLIConfigs, mockSubmissionBucketName, mockConfigurationService, 
        mockUploadingMonitor, mockDataCommonsBucketMap, mockAuthorizationService, 
        mockDataModelService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.SUBMITTER
    };

    const mockSubmission = {
        _id: 'submission-123',
        name: 'Test Submission',
        submitterID: 'test-user-id',
        studyID: 'study-123',
        dataCommons: ['commons1'],
        status: 'IN_PROGRESS',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
    };

    const mockCollaborators = [
        {
            _id: 'collaborator-1',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons1'],
            studies: [{ _id: 'study-123', name: 'Test Study' }],
            permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
        },
        {
            _id: 'collaborator-2',
            firstName: 'Bob',
            lastName: 'Johnson',
            email: 'bob@example.com',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons2'],
            studies: [{ _id: 'study-123', name: 'Test Study' }],
            permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
        }
    ];

    const mockCollaboratorsWithDisplayNames = [
        {
            _id: 'collaborator-1',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons1'],
            dataCommonsDisplayNames: ['commons1_display'],
            studies: [{ _id: 'study-123', name: 'Test Study' }],
            permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
        },
        {
            _id: 'collaborator-2',
            firstName: 'Bob',
            lastName: 'Johnson',
            email: 'bob@example.com',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons2'],
            dataCommonsDisplayNames: ['commons2_display'],
            studies: [{ _id: 'study-123', name: 'Test Study' }],
            permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
        }
    ];

    beforeEach(() => {
        // Mock collections and services
        mockSubmissionCollection = {
            aggregate: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateMany: jest.fn()
        };

        mockLogCollection = {};
        mockBatchService = {};
        mockUserService = {
            getCollaboratorsByStudyID: jest.fn()
        };
        mockOrganizationService = {};
        mockNotificationService = {};
        mockDataRecordService = {};
        mockFetchDataModelInfo = jest.fn();
        mockAwsService = {};
        mockMetadataQueueName = 'test-queue';
        mockS3Service = {};
        mockEmailParams = {};
        mockDataCommonsList = ['commons1', 'commons2'];
        mockHiddenDataCommonsList = [];
        mockValidationCollection = {};
        mockSqsLoaderQueue = 'test-sqs-queue';
        mockQcResultsService = {};
        mockUploaderCLIConfigs = {};
        mockSubmissionBucketName = 'test-bucket';
        mockConfigurationService = {};
        mockUploadingMonitor = {};
        mockDataCommonsBucketMap = {};
        mockAuthorizationService = {
            getPermissionScope: jest.fn().mockResolvedValue([
                {
                    scope: 'all',
                    scopeValues: ['*']
                }
            ])
        };
        mockDataModelService = {};

        // Create service instance
        submissionService = new Submission(
            mockLogCollection,
            mockSubmissionCollection,
            mockBatchService,
            mockUserService,
            mockOrganizationService,
            mockNotificationService,
            mockDataRecordService,
            mockFetchDataModelInfo,
            mockAwsService,
            mockMetadataQueueName,
            mockS3Service,
            mockEmailParams,
            mockDataCommonsList,
            mockHiddenDataCommonsList,
            mockValidationCollection,
            mockSqsLoaderQueue,
            mockQcResultsService,
            mockUploaderCLIConfigs,
            mockSubmissionBucketName,
            mockConfigurationService,
            mockUploadingMonitor,
            mockDataCommonsBucketMap,
            mockAuthorizationService,
            mockDataModelService
        );

        // Override DAOs with mocks to prevent Prisma calls
        submissionService.pendingPVDAO = { findBySubmissionID: jest.fn(), insertOne: jest.fn() };
        submissionService.submissionDAO = { 
            update: jest.fn(), 
            create: jest.fn(), 
            findById: jest.fn(),
            findFirst: jest.fn().mockResolvedValue(mockSubmission) // Add findFirst method
        };
        submissionService.programDAO = { findById: jest.fn() };
        submissionService.userDAO = { findById: jest.fn() };
        submissionService.approvedStudyDAO = { findMany: jest.fn() };
        submissionService.validationDAO = { create: jest.fn(), update: jest.fn() };

        // Mock context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            submissionID: 'submission-123'
        };

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Method Interface and Behavior', () => {
        it('should have the correct method signature', () => {
            expect(typeof submissionService.listPotentialCollaborators).toBe('function');
            expect(submissionService.listPotentialCollaborators.length).toBe(2); // params, context
        });

        it('should return a promise', () => {
            // Mock the method dependencies
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);
            
            const result = submissionService.listPotentialCollaborators(params, context);
            expect(result).toBeInstanceOf(Promise);
        });

        it('should handle successful case with collaborators', async () => {
            // Mock dependencies
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });

        it('should handle empty collaborators list', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual([]);
        });
    });

    describe('Input Validation', () => {
        it('should handle null context', async () => {
            await expect(submissionService.listPotentialCollaborators(params, null))
                .rejects
                .toThrow();
        });

        it('should handle empty params object', async () => {
            await expect(submissionService.listPotentialCollaborators({}, context))
                .rejects
                .toThrow();
        });

        it('should handle params without submissionID', async () => {
            await expect(submissionService.listPotentialCollaborators({}, context))
                .rejects
                .toThrow();
        });

        it('should handle params with undefined submissionID', async () => {
            await expect(submissionService.listPotentialCollaborators({ submissionID: undefined }, context))
                .rejects
                .toThrow();
        });
    });

    describe('Session and Permission Validation', () => {
        it('should verify session is initialized', async () => {
            const { verifySession } = require('../../verifier/user-info-verifier');
            
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            await submissionService.listPotentialCollaborators(params, context);

            expect(verifySession).toHaveBeenCalledWith(context);
        });

        it('should throw error when submission is not found', async () => {
            // Mock the _findByID method to return null
            submissionService._findByID = jest.fn().mockResolvedValue(null);

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('Cant find the submission by submissionID');
        });

        it('should throw error when user is not the submitter', async () => {
            const submissionWithDifferentSubmitter = {
                ...mockSubmission,
                submitterID: 'different-user-id'
            };

            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithDifferentSubmitter);

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should allow access when user is the submitter', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            await submissionService.listPotentialCollaborators(params, context);

            expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });
    });

    describe('Collaborator Retrieval', () => {
        it('should call getCollaboratorsByStudyID with correct parameters', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            await submissionService.listPotentialCollaborators(params, context);

            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });

        it('should handle getCollaboratorsByStudyID error', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockRejectedValue(new Error('Database error'));

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('Database error');
        });

        it('should handle empty collaborators from getCollaboratorsByStudyID', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual([]);
        });
    });

    describe('Data Commons Display Names Processing', () => {
        it('should apply getDataCommonsDisplayNamesForUser to each collaborator', async () => {
            const { getDataCommonsDisplayNamesForUser } = require('../../utility/data-commons-remapper');
            
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            await submissionService.listPotentialCollaborators(params, context);

            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledTimes(2);
            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(mockCollaborators[0]);
            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(mockCollaborators[1]);
        });

        it('should return collaborators with display names', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            expect(result[0]).toHaveProperty('dataCommonsDisplayNames');
            expect(result[1]).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Return Value Format', () => {
        it('should return array of collaborators with display names', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('_id');
            expect(result[0]).toHaveProperty('firstName');
            expect(result[0]).toHaveProperty('lastName');
            expect(result[0]).toHaveProperty('email');
            expect(result[0]).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should preserve all original collaborator properties', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result[0]._id).toBe('collaborator-1');
            expect(result[0].firstName).toBe('Jane');
            expect(result[0].lastName).toBe('Smith');
            expect(result[0].email).toBe('jane@example.com');
            expect(result[0].role).toBe(USER.ROLES.SUBMITTER);
            expect(result[0].userStatus).toBe(USER.STATUSES.ACTIVE);
        });
    });
}); 