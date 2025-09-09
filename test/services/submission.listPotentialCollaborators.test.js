const { Submission } = require('../../services/submission');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { ERROR } = require('../../constants/error-constants');
const { isAllStudy } = require('../../utility/study-utility');

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

// Mock the study-utility to control validateStudyAccess behavior
jest.mock('../../utility/study-utility', () => ({
    isAllStudy: jest.fn()
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

    // Helper function to create user scope mocks with customizable overrides
    const createUserScopeMock = (overrides = {}) => {
        const defaultScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
            isRoleScope: jest.fn().mockReturnValue(false),
            isOwnScope: jest.fn().mockReturnValue(false),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false)
        };
        
        return {
            ...defaultScope,
            ...overrides
        };
    };

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

        // Mock the _getUserScope method
        submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());

        // Mock context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            submissionID: 'submission-123'
        };

        // Reset mocks
        jest.clearAllMocks();
        isAllStudy.mockClear();
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
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });

        it('should handle empty collaborators list', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
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

        it('should throw error when user has no data_submission:review permission', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isNoneScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should allow access when user has data_submission:review permission', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            await submissionService.listPotentialCollaborators(params, context);

            expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
            expect(submissionService._getUserScope).toHaveBeenCalledWith(
                context.userInfo, 
                USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, 
                mockSubmission
            );
            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });
    });

    describe('Scope-Based Permission Validation', () => {
        describe('None Scope', () => {
            it('should deny access for users with none scope', async () => {
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isNoneScope: jest.fn().mockReturnValue(true)
                }));

                await expect(submissionService.listPotentialCollaborators(params, context))
                    .rejects
                    .toThrow('You do not have permission to perform this action.');
            });
        });

        describe('Role Scope', () => {
            it('should deny access for users with role scope', async () => {
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isRoleScope: jest.fn().mockReturnValue(true)
                }));

                await expect(submissionService.listPotentialCollaborators(params, context))
                    .rejects
                    .toThrow('You do not have permission to perform this action.');
            });
        });

        describe('Own Scope', () => {
            it('should allow access for submitter with own scope', async () => {
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isOwnScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

                await submissionService.listPotentialCollaborators(params, context);

                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
            });

            it('should deny access for non-submitter with own scope', async () => {
                const differentUserContext = {
                    userInfo: {
                        ...mockUserInfo,
                        _id: 'different-user-id'
                    }
                };

                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isOwnScope: jest.fn().mockReturnValue(true)
                }));

                await expect(submissionService.listPotentialCollaborators(params, differentUserContext))
                    .rejects
                    .toThrow('You do not have permission to perform this action.');
            });
        });

        describe('Study Scope', () => {
            it('should allow access for user with study scope and valid study access', async () => {
                // Mock isAllStudy to return false and let the study matching logic work
                isAllStudy.mockReturnValue(false);
                
                const userWithValidStudy = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-123' }] // Matching study ID
                };
                const contextWithValidStudy = {
                    userInfo: userWithValidStudy
                };
                
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isStudyScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

                const result = await submissionService.listPotentialCollaborators(params, contextWithValidStudy);

                expect(isAllStudy).toHaveBeenCalledWith([{ _id: 'study-123' }]);
                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith(mockSubmission.studyID, mockSubmission.submitterID);
                expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            });

            it('should allow access for user with study scope and "All" studies access', async () => {
                // Mock isAllStudy to return true for "All" studies access
                isAllStudy.mockReturnValue(true);
                
                const userWithAllStudies = {
                    ...mockUserInfo,
                    studies: [{ _id: "All" }]
                };
                const contextWithAllStudies = {
                    userInfo: userWithAllStudies
                };

                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isStudyScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

                const result = await submissionService.listPotentialCollaborators(params, contextWithAllStudies);

                expect(isAllStudy).toHaveBeenCalledWith([{ _id: "All" }]);
                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith(mockSubmission.studyID, mockSubmission.submitterID);
                expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            });

            it('should allow access for user with study scope and matching study ID using alternative ID field', async () => {
                // Mock isAllStudy to return false and let the study matching logic work
                isAllStudy.mockReturnValue(false);
                
                const userWithAlternativeId = {
                    ...mockUserInfo,
                    studies: [{ id: 'study-123' }] // Using 'id' instead of '_id'
                };
                const contextWithAlternativeId = {
                    userInfo: userWithAlternativeId
                };
                
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isStudyScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

                const result = await submissionService.listPotentialCollaborators(params, contextWithAlternativeId);

                expect(isAllStudy).toHaveBeenCalledWith([{ id: 'study-123' }]);
                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith(mockSubmission.studyID, mockSubmission.submitterID);
                expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            });

            it('should deny access for user with study scope but invalid study access', async () => {
                // Mock isAllStudy to return false and ensure no study matching occurs
                isAllStudy.mockReturnValue(false);
                
                const userWithInvalidStudy = {
                    ...mockUserInfo,
                    studies: [{ _id: 'different-study-id' }] // Non-matching study ID
                };
                const contextWithInvalidStudy = {
                    userInfo: userWithInvalidStudy
                };
                
                submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isStudyScope: jest.fn().mockReturnValue(true)
                }));

                await expect(submissionService.listPotentialCollaborators(params, contextWithInvalidStudy))
                    .rejects
                    .toThrow('You do not have permission to perform this action.');

                expect(isAllStudy).toHaveBeenCalledWith([{ _id: 'different-study-id' }]);
            });
        });

        describe('DC Scope', () => {
            it('should allow access for user with DC scope and valid data commons access', async () => {
                const userWithDataCommons = {
                    ...mockUserInfo,
                    dataCommons: ['commons1', 'commons2']
                };
                const submissionWithDataCommons = {
                    ...mockSubmission,
                    dataCommons: 'commons1'
                };

                submissionService._findByID = jest.fn().mockResolvedValue(submissionWithDataCommons);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isDCScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

                const contextWithDataCommons = {
                    userInfo: userWithDataCommons
                };

                const result = await submissionService.listPotentialCollaborators(params, contextWithDataCommons);

                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
                expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            });

            it('should allow access for user with DC scope and data commons as array', async () => {
                const userWithDataCommons = {
                    ...mockUserInfo,
                    dataCommons: ['commons1', 'commons2', 'commons3'] // User has multiple data commons
                };
                const submissionWithDataCommons = {
                    ...mockSubmission,
                    dataCommons: 'commons1' // Submission has single data commons value
                };

                submissionService._findByID = jest.fn().mockResolvedValue(submissionWithDataCommons);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isDCScope: jest.fn().mockReturnValue(true)
                }));
                mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

                const contextWithDataCommons = {
                    userInfo: userWithDataCommons
                };

                const result = await submissionService.listPotentialCollaborators(params, contextWithDataCommons);

                expect(submissionService._findByID).toHaveBeenCalledWith('submission-123');
                expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
                expect(result).toEqual(mockCollaboratorsWithDisplayNames);
            });

            it('should deny access for user with DC scope but invalid data commons access', async () => {
                const userWithDataCommons = {
                    ...mockUserInfo,
                    dataCommons: ['commons2', 'commons3']
                };
                const submissionWithDataCommons = {
                    ...mockSubmission,
                    dataCommons: 'commons1'
                };

                submissionService._findByID = jest.fn().mockResolvedValue(submissionWithDataCommons);
                submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                    isDCScope: jest.fn().mockReturnValue(true)
                }));

                const contextWithDataCommons = {
                    userInfo: userWithDataCommons
                };

                await expect(submissionService.listPotentialCollaborators(params, contextWithDataCommons))
                    .rejects
                    .toThrow('You do not have permission to perform this action.');
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing userInfo._id in own scope check', async () => {
            const contextWithoutId = {
                userInfo: {
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe'
                    // _id is missing
                }
            };

            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isOwnScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, contextWithoutId))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle missing submission.submitterID in own scope check', async () => {
            const submissionWithoutSubmitter = {
                ...mockSubmission,
                submitterID: undefined
            };

            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithoutSubmitter);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isOwnScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle missing userInfo.studies in study scope check', async () => {
            const contextWithoutStudies = {
                userInfo: {
                    ...mockUserInfo,
                    studies: undefined
                }
            };

            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isStudyScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, contextWithoutStudies))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle missing userInfo.dataCommons in DC scope check', async () => {
            const contextWithoutDataCommons = {
                userInfo: {
                    ...mockUserInfo,
                    dataCommons: undefined
                }
            };

            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isDCScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, contextWithoutDataCommons))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle missing submission.dataCommons in DC scope check', async () => {
            const submissionWithoutDataCommons = {
                ...mockSubmission,
                dataCommons: undefined
            };

            submissionService._findByID = jest.fn().mockResolvedValue(submissionWithoutDataCommons);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock({
                isDCScope: jest.fn().mockReturnValue(true)
            }));

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });
    });

    describe('Collaborator Retrieval', () => {
        it('should call getCollaboratorsByStudyID with correct parameters', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            await submissionService.listPotentialCollaborators(params, context);

            expect(mockUserService.getCollaboratorsByStudyID).toHaveBeenCalledWith('study-123', 'test-user-id');
        });

        it('should handle getCollaboratorsByStudyID error', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockRejectedValue(new Error('Database error'));

            await expect(submissionService.listPotentialCollaborators(params, context))
                .rejects
                .toThrow('Database error');
        });

        it('should handle empty collaborators from getCollaboratorsByStudyID', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue([]);

            const result = await submissionService.listPotentialCollaborators(params, context);

            expect(result).toEqual([]);
        });
    });

    describe('Data Commons Display Names Processing', () => {
        it('should apply getDataCommonsDisplayNamesForUser to each collaborator', async () => {
            const { getDataCommonsDisplayNamesForUser } = require('../../utility/data-commons-remapper');
            
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
            mockUserService.getCollaboratorsByStudyID = jest.fn().mockResolvedValue(mockCollaborators);

            await submissionService.listPotentialCollaborators(params, context);

            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledTimes(2);
            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(mockCollaborators[0]);
            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(mockCollaborators[1]);
        });

        it('should return collaborators with display names', async () => {
            submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
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
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
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
            submissionService._getUserScope = jest.fn().mockResolvedValue(createUserScopeMock());
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