const { Submission } = require('../../services/submission');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { ERROR } = require('../../constants/error-constants');
const SUBMISSION_CONSTANTS = require('../../constants/submission-constants');

// Mock the user-info-verifier
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));

// Mock the data-commons-remapper utility
jest.mock('../../utility/data-commons-remapper', () => ({
    getDataCommonsDisplayNamesForSubmission: jest.fn((submission) => ({
        ...submission,
        dataCommonsDisplayNames: submission.dataCommons ? submission.dataCommons.map(dc => `${dc}_display`) : []
    })),
    getDataCommonsDisplayNamesForUser: jest.fn((user) => ({
        ...user,
        dataCommonsDisplayNames: user.dataCommons ? user.dataCommons.map(dc => `${dc}_display`) : []
    }))
}));

describe('Submission.editSubmissionCollaborators', () => {
    let submissionService;
    let mockSubmissionCollection, mockLogCollection, mockBatchService, mockUserService, 
        mockOrganizationService, mockNotificationService, mockDataRecordService, 
        mockFetchDataModelInfo, mockAwsService, mockMetadataQueueName, mockS3Service, 
        mockEmailParams, mockDataCommonsList, mockHiddenDataCommonsList, 
        mockValidationCollection, mockSqsLoaderQueue, mockQcResultsService, 
        mockUploaderCLIConfigs, mockSubmissionBucketName, mockConfigurationService, 
        mockUploadingMonitor, mockDataCommonsBucketMap, mockAuthorizationService, 
        mockDataModelService, mockUserDAO;
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
        status: SUBMISSION_CONSTANTS.IN_PROGRESS,
        collaborators: [],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z'
    };

    const mockCollaborator = {
        _id: 'collaborator-1',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        organization: 'Test Organization',
        studies: [{ _id: 'study-123', name: 'Test Study' }],
        permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
    };

    const mockCollaboratorsInput = [
        {
            collaboratorID: 'collaborator-1',
            permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT
        }
    ];

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock collections and services
        mockSubmissionCollection = {
            update: jest.fn()
        };
        mockLogCollection = {};
        mockBatchService = {};
        mockUserService = {};
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
        mockSqsLoaderQueue = {};
        mockQcResultsService = {};
        mockUploaderCLIConfigs = {};
        mockSubmissionBucketName = 'test-bucket';
        mockConfigurationService = {};
        mockUploadingMonitor = {};
        mockDataCommonsBucketMap = {};
        mockAuthorizationService = {};
        mockDataModelService = {};
        mockUserDAO = {
            findFirst: jest.fn()
        };

        // Create submission service instance
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

        // Set up userDAO
        submissionService.userDAO = mockUserDAO;

        // Set up context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            submissionID: 'submission-123',
            collaborators: mockCollaboratorsInput
        };

        // Mock _findByID method
        submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
        
        // Mock _verifyStudyInUserStudies method
        submissionService._verifyStudyInUserStudies = jest.fn().mockReturnValue(true);
    });

    describe('Function signature', () => {
        it('should be a function', () => {
            expect(typeof submissionService.editSubmissionCollaborators).toBe('function');
        });

        it('should accept two parameters', () => {
            expect(submissionService.editSubmissionCollaborators.length).toBe(2); // params, context
        });
    });

    describe('Parameter validation', () => {
        it('should throw error when context is null', async () => {
            await expect(submissionService.editSubmissionCollaborators(params, null))
                .rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
        });

        it('should throw error when params is empty', async () => {
            await expect(submissionService.editSubmissionCollaborators({}, context))
                .rejects.toThrow(ERROR.VERIFY.INVALID_SUBMISSION_ID);
        });

        it('should throw error when submissionID is missing', async () => {
            await expect(submissionService.editSubmissionCollaborators({}, context))
                .rejects.toThrow(ERROR.VERIFY.INVALID_SUBMISSION_ID);
        });

        it('should throw error when submissionID is undefined', async () => {
            await expect(submissionService.editSubmissionCollaborators({ submissionID: undefined }, context))
                .rejects.toThrow(ERROR.VERIFY.INVALID_SUBMISSION_ID);
        });
    });

    describe('Submission validation', () => {
        it('should throw error when submission does not exist', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(null);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
        });

        it('should throw error when submission status is invalid for editing collaborators', async () => {
            const invalidStatusSubmission = { ...mockSubmission, status: SUBMISSION_CONSTANTS.COMPLETED };
            submissionService._findByID = jest.fn().mockResolvedValue(invalidStatusSubmission);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_STATUS_EDIT_COLLABORATOR);
        });

        it('should throw error when submission has no studyID', async () => {
            const noStudySubmission = { ...mockSubmission, studyID: null };
            submissionService._findByID = jest.fn().mockResolvedValue(noStudySubmission);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_SUBMISSION_STUDY);
        });

        it('should throw error when user is not the submitter', async () => {
            const differentSubmitterSubmission = { ...mockSubmission, submitterID: 'different-user-id' };
            submissionService._findByID = jest.fn().mockResolvedValue(differentSubmitterSubmission);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });
    });

    describe('Collaborator validation', () => {
        it('should throw error when collaborator does not exist', async () => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(null);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.COLLABORATOR_NOT_EXIST);
        });

        it('should throw error when collaborator role is not SUBMITTER', async () => {
            const nonSubmitterUser = { ...mockCollaborator, role: USER.ROLES.DATA_COMMONS_PERSONNEL };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(nonSubmitterUser);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_ROLE_SUBMITTER);
        });

        it('should throw error when collaborator does not have access to the study', async () => {
            const userWithoutStudy = { ...mockCollaborator, studies: [{ _id: 'different-study', name: 'Different Study' }] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithoutStudy);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
        });

        it('should throw error when collaborator permission is invalid', async () => {
            const invalidPermissionCollaborators = [
                {
                    collaboratorID: 'collaborator-1',
                    permission: 'Invalid Permission'
                }
            ];
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);

            await expect(submissionService.editSubmissionCollaborators({ ...params, collaborators: invalidPermissionCollaborators }, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_PERMISSION);
        });

        it('should accept existing collaborator without re-validation', async () => {
            const submissionWithExistingCollaborator = {
                ...mockSubmission,
                collaborators: [{ collaboratorID: 'collaborator-1', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }]
            };
            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithExistingCollaborator);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
            expect(mockUserDAO.findFirst).not.toHaveBeenCalled();
        });
    });

    describe('Successful collaborator editing', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        });

        it('should successfully edit collaborators', async () => {
            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
            expect(result.collaborators).toEqual([
                {
                    collaboratorID: 'collaborator-1',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: 'Test Organization'
                }
            ]);
            expect(result.updatedAt).toBeDefined();
        });

        it('should initialize empty collaborators array if not present', async () => {
            const submissionWithoutCollaborators = { ...mockSubmission, collaborators: undefined };
            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithoutCollaborators);

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result.collaborators).toEqual([
                {
                    collaboratorID: 'collaborator-1',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: 'Test Organization'
                }
            ]);
        });

        it('should handle multiple collaborators', async () => {
            const multipleCollaborators = [
                {
                    collaboratorID: 'collaborator-1',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT
                },
                {
                    collaboratorID: 'collaborator-2',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT
                }
            ];

            const secondCollaborator = {
                _id: 'collaborator-2',
                firstName: 'Bob',
                lastName: 'Johnson',
                email: 'bob@example.com',
                role: USER.ROLES.SUBMITTER,
                userStatus: USER.STATUSES.ACTIVE,
                organization: 'Another Organization',
                studies: [{ _id: 'study-123', name: 'Test Study' }],
                permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
            };

            mockUserDAO.findFirst
                .mockResolvedValueOnce(mockCollaborator)
                .mockResolvedValueOnce(secondCollaborator);

            const result = await submissionService.editSubmissionCollaborators({ ...params, collaborators: multipleCollaborators }, context);

            expect(result.collaborators).toHaveLength(2);
            expect(result.collaborators[0].collaboratorName).toBe('Smith, Jane');
            expect(result.collaborators[1].collaboratorName).toBe('Johnson, Bob');
        });

        it('should call submissionCollection.update with correct parameters', async () => {
            await submissionService.editSubmissionCollaborators(params, context);

            expect(mockSubmissionCollection.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'submission-123',
                    collaborators: expect.arrayContaining([
                        expect.objectContaining({
                            collaboratorID: 'collaborator-1',
                            permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT
                        })
                    ])
                })
            );
        });
    });

    describe('Database update handling', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
        });

        it('should throw error when database update fails', async () => {
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 0 });

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
        });

        it('should throw error when database update returns undefined', async () => {
            mockSubmissionCollection.update = jest.fn().mockResolvedValue(undefined);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
        });
    });

    describe('Study access validation', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
        });

        it('should accept user with "All" study access', async () => {
            const userWithAllAccess = { ...mockCollaborator, studies: [{ _id: 'All', name: 'All Studies' }] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithAllAccess);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
        });

        it('should accept user with string-based study access', async () => {
            const userWithStringStudies = { ...mockCollaborator, studies: ['study-123', 'All'] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithStringStudies);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
        });

        it('should reject user with no studies', async () => {
            const userWithNoStudies = { ...mockCollaborator, studies: [] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithNoStudies);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
        });

        it('should reject user with undefined studies', async () => {
            const userWithUndefinedStudies = { ...mockCollaborator, studies: undefined };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithUndefinedStudies);

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
        });
    });

    describe('Valid submission statuses', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        });

        it.each([
            SUBMISSION_CONSTANTS.NEW,
            SUBMISSION_CONSTANTS.IN_PROGRESS,
            SUBMISSION_CONSTANTS.SUBMITTED,
            SUBMISSION_CONSTANTS.RELEASED,
            SUBMISSION_CONSTANTS.ARCHIVED,
            SUBMISSION_CONSTANTS.REJECTED,
            SUBMISSION_CONSTANTS.WITHDRAWN
        ])('should allow editing collaborators when submission status is %s', async (status) => {
            const submissionWithStatus = { ...mockSubmission, status };
            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithStatus);

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
        });
    });

    describe('Error handling', () => {
        it('should handle _findByID throwing an error', async () => {
            submissionService._findByID = jest.fn().mockRejectedValue(new Error('Database error'));

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow('Database error');
        });

        it('should handle userDAO.findFirst throwing an error', async () => {
            mockUserDAO.findFirst = jest.fn().mockRejectedValue(new Error('User lookup error'));

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow('User lookup error');
        });

        it('should handle submissionCollection.update throwing an error', async () => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            mockSubmissionCollection.update = jest.fn().mockRejectedValue(new Error('Update error'));

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow('Update error');
        });
    });
}); 