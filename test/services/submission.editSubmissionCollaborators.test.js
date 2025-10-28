const { Submission } = require('../../services/submission');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const ERROR = require('../../constants/error-constants');
const SUBMISSION_CONSTANTS = require('../../constants/submission-constants');
const { replaceErrorString } = require('../../utility/string-util');
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
        
        // Mock userDAO.findFirst for collaborator validation
        mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
        
        // Mock submissionCollection.update to return success
        mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        
        // Mock _findByID method
        submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
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
        it('should throw error when params is empty', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(null);
            await expect(submissionService.editSubmissionCollaborators({ collaborators: [] }, context))
                .rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
        });

        it('should throw error when submissionID is missing', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(null);
            await expect(submissionService.editSubmissionCollaborators({ collaborators: [] }, context))
                .rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
        });

        it('should throw error when submissionID is undefined', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(null);
            await expect(submissionService.editSubmissionCollaborators({ submissionID: undefined, collaborators: [] }, context))
                .rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
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
                .rejects.toThrow("Submission status is invalid to edit collaborator; 'Completed'");
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
            submissionService._verifyStudyInUserStudies = jest.fn().mockReturnValue(false);

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
            submissionService._verifyStudyInUserStudies = jest.fn().mockReturnValue(true);

            await expect(
                submissionService.editSubmissionCollaborators({ ...params, collaborators: invalidPermissionCollaborators }, context)
            ).rejects.toThrow(
                replaceErrorString(ERROR.INVALID_ACCESS_EDIT_COLLABORATOR, "'Invalid Permission'")
            );
        });

        it('should accept existing collaborator without re-validation', async () => {
            const submissionWithExistingCollaborator = {
                ...mockSubmission,
                collaborators: [{ collaboratorID: 'collaborator-1', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }]
            };
            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithExistingCollaborator);
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
            // The method still calls findFirst to get user info for collaboratorName and Organization
            expect(mockUserDAO.findFirst).toHaveBeenCalledWith({ id: 'collaborator-1' });
        });
    });

    describe('Successful collaborator editing', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            mockSubmissionCollection.update = jest.fn().mockResolvedValue({ modifiedCount: 1 });
        });

        it('should successfully edit collaborators', async () => {
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    }
                ],
                updatedAt: new Date()
            });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
            expect(result.collaborators).toEqual([
                {
                    collaboratorID: 'collaborator-1',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: { name: 'Test Organization' }
                }
            ]);
            expect(result.updatedAt).toBeDefined();
        });

        it('should initialize empty collaborators array if not present', async () => {
            const submissionWithoutCollaborators = { ...mockSubmission, collaborators: undefined };
            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithoutCollaborators);
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    }
                ],
                updatedAt: new Date()
            });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result.collaborators).toEqual([
                {
                    collaboratorID: 'collaborator-1',
                    permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: { name: 'Test Organization' }
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
                organization: { name: 'Another Organization' },
                studies: [{ _id: 'study-123', name: 'Test Study' }],
                permissions: [`${USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE}:own`]
            };

            // Ensure both collaborators have organization as an object, not a string
            const firstCollaborator = {
                ...mockCollaborator,
                organization: { name: 'Test Organization' }
            };

            mockUserDAO.findFirst
                .mockResolvedValueOnce(firstCollaborator)
                .mockResolvedValueOnce(secondCollaborator);

            // Mock the update to return collaborators with correct Organization object
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    },
                    {
                        collaboratorID: 'collaborator-2',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Johnson, Bob',
                        Organization: { name: 'Another Organization' }
                    }
                ],
                updatedAt: new Date()
            });

            const result = await submissionService.editSubmissionCollaborators({ ...params, collaborators: multipleCollaborators }, context);

            expect(result.collaborators).toHaveLength(2);
            expect(result.collaborators[0].collaboratorName).toBe('Smith, Jane');
            expect(result.collaborators[0].Organization).toEqual({ name: 'Test Organization' });
            expect(result.collaborators[1].collaboratorName).toBe('Johnson, Bob');
            expect(result.collaborators[1].Organization).toEqual({ name: 'Another Organization' });
        });
    });

    describe('Database update handling', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue(undefined);
        });

        it('should throw error when database update fails', async () => {
            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);

            // Also test if the promise resolves, fail the test
            await submissionService.editSubmissionCollaborators(params, context)
                .then(() => {
                    throw new Error('Expected method to reject.');
                })
                .catch(err => {
                    expect(err.message).toBe(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
                });
        });

        it('should throw error when database update returns undefined', async () => {
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue(undefined);

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
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    }
                ],
                updatedAt: new Date()
            });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
        });

        it('should accept user with string-based study access', async () => {
            const userWithStringStudies = { ...mockCollaborator, studies: ['study-123', 'All'] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithStringStudies);
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    }
                ],
                updatedAt: new Date()
            });

            const result = await submissionService.editSubmissionCollaborators(params, context);

            expect(result).toBeDefined();
        });

        it('should reject user with no studies', async () => {
            const userWithNoStudies = { ...mockCollaborator, studies: [] };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithNoStudies);
            submissionService._verifyStudyInUserStudies = jest.fn().mockReturnValue(false);
            
            // Use a different collaborator ID to ensure it's not already in the submission
            const paramsWithNewCollaborator = {
                ...params,
                collaborators: [{ collaboratorID: 'new-collaborator', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }]
            };

            await expect(submissionService.editSubmissionCollaborators(paramsWithNewCollaborator, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
        });

        it('should reject user with undefined studies', async () => {
            const userWithUndefinedStudies = { ...mockCollaborator, studies: undefined };
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(userWithUndefinedStudies);
            submissionService._verifyStudyInUserStudies = jest.fn().mockReturnValue(false);
            
            // Use a different collaborator ID to ensure it's not already in the submission
            const paramsWithNewCollaborator = {
                ...params,
                collaborators: [{ collaboratorID: 'new-collaborator-2', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }]
            };

            await expect(submissionService.editSubmissionCollaborators(paramsWithNewCollaborator, context))
                .rejects.toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
        });
    });

    describe('Valid submission statuses', () => {
        beforeEach(() => {
            mockUserDAO.findFirst = jest.fn().mockResolvedValue(mockCollaborator);
            submissionService.submissionDAO.update = jest.fn().mockResolvedValue({
                ...mockSubmission,
                collaborators: [
                    {
                        collaboratorID: 'collaborator-1',
                        permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT,
                        collaboratorName: 'Smith, Jane',
                        Organization: { name: 'Test Organization' }
                    }
                ],
                updatedAt: new Date()
            });
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
            submissionService.submissionDAO.update = jest.fn().mockRejectedValue(new Error('Update error'));

            await expect(submissionService.editSubmissionCollaborators(params, context))
                .rejects.toThrow('Update error');
        });
    });
}); 