const UserInitializationService = require('../../services/user-initialization-service');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const ERROR = require('../../constants/error-constants');

describe('UserInitializationService.getMyUser', () => {
    let userInitializationService;
    let mockUserCollection, mockOrganizationCollection, mockApprovedStudiesCollection, mockConfigurationService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH
    };

    const mockExistingUser = {
        _id: 'existing-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.USER,
        userStatus: USER.STATUSES.ACTIVE,
        organization: {
            orgID: 'org-123'
        },
        studies: [
            { _id: 'study-1', studyName: 'Study 1' },
            { _id: 'study-2', studyName: 'Study 2' }
        ],
        permissions: ['permission1', 'permission2'],
        notifications: ['notification1', 'notification2'],
        dataCommons: ['commons1'],
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockOrganization = {
        _id: 'org-123',
        name: 'Test Organization',
        status: USER.STATUSES.ACTIVE,
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockApprovedStudies = [
        { _id: 'study-1', studyName: 'Study 1' },
        { _id: 'study-2', studyName: 'Study 2' }
    ];

    beforeEach(() => {
        // Mock collections
        mockUserCollection = {
            aggregate: jest.fn(),
            insert: jest.fn()
        };

        mockOrganizationCollection = {
            find: jest.fn()
        };

        mockApprovedStudiesCollection = {
            aggregate: jest.fn()
        };

        mockConfigurationService = {
            isMaintenanceMode: jest.fn().mockResolvedValue(false),
            getAccessControl: jest.fn().mockResolvedValue({
                permissions: {
                    permitted: ['permission1', 'permission2']
                },
                notifications: {
                    permitted: ['notification1', 'notification2']
                }
            })
        };

        // Create service instance
        userInitializationService = new UserInitializationService(
            mockUserCollection,
            mockOrganizationCollection,
            mockApprovedStudiesCollection,
            mockConfigurationService
        );

        // Mock utility functions
        global.getDataCommonsDisplayNamesForUser = jest.fn((user) => ({
            ...user,
            dataCommonsDisplayNames: user.dataCommons || []
        }));

        global.orgToUserOrg = jest.fn((org) => ({
            orgID: org._id,
            orgName: org.name,
            status: org.status,
            createdAt: org.createdAt,
            updateAt: org.updateAt
        }));

        global.getCurrentTime = jest.fn().mockReturnValue(new Date('2023-01-01T00:00:00Z'));
        global.v4 = jest.fn().mockReturnValue('new-user-id');

        // Test context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {};
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful scenarios', () => {
        it('should return existing user with organization and studies', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockOrganizationCollection.find.mockResolvedValue([mockOrganization]);
            mockApprovedStudiesCollection.aggregate.mockResolvedValue(mockApprovedStudies);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([
                {
                    "$match": {
                        email: 'test@example.com',
                        IDP: USER.IDPS.NIH,
                    }
                },
                {"$sort": {createdAt: -1}},
                {"$limit": 1}
            ]);

            expect(mockOrganizationCollection.find).toHaveBeenCalledWith('org-123');
            expect(mockApprovedStudiesCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "_id": { "$in": ['study-1', 'study-2'] }
                }
            }]);

            expect(result).toHaveProperty('dataCommonsDisplayNames');
            expect(result.organization).toEqual(expect.objectContaining({
                orgID: 'org-123',
                orgName: 'Test Organization'
            }));
            expect(result.studies).toEqual(mockApprovedStudies);
        });

        it('should return existing user without organization when orgID is null', async () => {
            // Setup
            const userWithoutOrg = { ...mockExistingUser, organization: {} };
            mockUserCollection.aggregate.mockResolvedValue([userWithoutOrg]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockOrganizationCollection.find).not.toHaveBeenCalled();
            expect(result).toEqual({
                ...userWithoutOrg,
                dataCommonsDisplayNames: ['commons1']
            });
        });

        it('should return existing user with "All" studies', async () => {
            // Setup
            const userWithAllStudies = {
                ...mockExistingUser,
                studies: [{ _id: 'All' }],
                organization: {} // No organization to avoid lookup
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithAllStudies]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockApprovedStudiesCollection.aggregate).not.toHaveBeenCalled();
            expect(result.studies).toEqual([{ _id: 'All', studyName: 'All' }]);
        });

        it('should create new user when user does not exist', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([]);
            mockUserCollection.insert.mockResolvedValue({ acknowledged: true });

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockUserCollection.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'test@example.com',
                    IDP: USER.IDPS.NIH,
                    userStatus: USER.STATUSES.ACTIVE,
                    role: USER.ROLES.USER,
                    organization: {},
                    dataCommons: [],
                    firstName: 'John',
                    lastName: 'Doe',
                    permissions: ['permission1', 'permission2'],
                    notifications: ['notification1', 'notification2']
                })
            );

            expect(result).toHaveProperty('dataCommonsDisplayNames');
            expect(result.email).toBe('test@example.com');
            expect(result.IDP).toBe(USER.IDPS.NIH);
            expect(result.userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(result.role).toBe(USER.ROLES.USER);
        });

        it('should create new user with default firstName when firstName is missing', async () => {
            // Setup
            const userInfoWithoutFirstName = {
                ...mockUserInfo,
                firstName: undefined
            };
            const contextWithoutFirstName = { userInfo: userInfoWithoutFirstName };

            mockUserCollection.aggregate.mockResolvedValue([]);
            mockUserCollection.insert.mockResolvedValue({ acknowledged: true });

            // Execute
            const result = await userInitializationService.getMyUser(params, contextWithoutFirstName);

            // Verify
            expect(mockUserCollection.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    firstName: 'test' // email.split("@")[0]
                })
            );
        });

        it('should allow admin access during maintenance mode', async () => {
            // Setup
            const adminUser = { 
                ...mockExistingUser, 
                role: USER.ROLES.ADMIN,
                organization: {} // No organization to avoid lookup
            };
            mockUserCollection.aggregate.mockResolvedValue([adminUser]);
            mockConfigurationService.isMaintenanceMode.mockResolvedValue(true);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(result).toBeDefined();
            expect(mockConfigurationService.isMaintenanceMode).toHaveBeenCalled();
        });
    });

    describe('Error scenarios', () => {
        it('should throw error when userInfo is missing email', async () => {
            // Setup
            const contextWithoutEmail = {
                userInfo: {
                    ...mockUserInfo,
                    email: undefined
                }
            };

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, contextWithoutEmail))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when userInfo is missing IDP', async () => {
            // Setup
            const contextWithoutIDP = {
                userInfo: {
                    ...mockUserInfo,
                    IDP: undefined
                }
            };

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, contextWithoutIDP))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when userInfo is null', async () => {
            // Setup
            const contextWithNullUserInfo = { userInfo: null };

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, contextWithNullUserInfo))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when user lookup fails', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, context))
                .rejects.toThrow(ERROR.DATABASE_OPERATION_FAILED);
        });

        it('should throw error when organization lookup fails', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockOrganizationCollection.find.mockResolvedValue(null);

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, context))
                .rejects.toThrow(ERROR.DATABASE_OPERATION_FAILED);
        });

        it('should handle missing organization gracefully', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockOrganizationCollection.find.mockResolvedValue([]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(result.organization).toEqual({});
        });

        it('should throw error when user creation fails', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([]);
            mockUserCollection.insert.mockResolvedValue({ acknowledged: false });

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, context))
                .rejects.toThrow(ERROR.DATABASE_OPERATION_FAILED);
        });

        it('should throw error when creating user with missing email', async () => {
            // Setup
            const userInfoWithoutEmail = {
                ...mockUserInfo,
                email: undefined
            };
            const contextWithoutEmail = { userInfo: userInfoWithoutEmail };

            mockUserCollection.aggregate.mockResolvedValue([]);

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, contextWithoutEmail))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when creating user with missing IDP', async () => {
            // Setup
            const userInfoWithoutIDP = {
                ...mockUserInfo,
                IDP: undefined
            };
            const contextWithoutIDP = { userInfo: userInfoWithoutIDP };

            mockUserCollection.aggregate.mockResolvedValue([]);

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, contextWithoutIDP))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when non-admin user tries to access during maintenance mode', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockConfigurationService.isMaintenanceMode.mockResolvedValue(true);

            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, context))
                .rejects.toThrow(ERROR.MAINTENANCE_MODE);
        });

        it('should handle approved studies lookup failure gracefully', async () => {
            // Setup
            const userWithStudies = {
                ...mockExistingUser,
                organization: {} // No organization to avoid lookup
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithStudies]);
            mockApprovedStudiesCollection.aggregate.mockResolvedValue(null);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(result.studies).toBeUndefined();
        });
    });

    describe('Edge cases', () => {
        it('should handle user with empty studies array', async () => {
            // Setup
            const userWithEmptyStudies = {
                ...mockExistingUser,
                studies: []
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithEmptyStudies]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockApprovedStudiesCollection.aggregate).not.toHaveBeenCalled();
            expect(result.studies).toEqual([]);
        });

        it('should handle user with null studies', async () => {
            // Setup
            const userWithNullStudies = {
                ...mockExistingUser,
                studies: null
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithNullStudies]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockApprovedStudiesCollection.aggregate).not.toHaveBeenCalled();
            expect(result.studies).toBeNull();
        });

        it('should handle user with undefined studies', async () => {
            // Setup
            const userWithUndefinedStudies = {
                ...mockExistingUser,
                studies: undefined
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithUndefinedStudies]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockApprovedStudiesCollection.aggregate).not.toHaveBeenCalled();
            expect(result.studies).toBeUndefined();
        });

        it('should handle studies with string IDs', async () => {
            // Setup
            const userWithStringStudies = {
                ...mockExistingUser,
                studies: ['study-1', 'study-2']
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithStringStudies]);
            mockApprovedStudiesCollection.aggregate.mockResolvedValue(mockApprovedStudies);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(mockApprovedStudiesCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "_id": { "$in": ['study-1', 'study-2'] }
                }
            }]);
        });

        it('should handle empty context', async () => {
            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, {}))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should handle context with undefined userInfo', async () => {
            // Execute & Verify
            await expect(userInitializationService.getMyUser(params, { userInfo: undefined }))
                .rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });
    });

    describe('Integration with data commons display names', () => {
        it('should call getDataCommonsDisplayNamesForUser with correct user data', async () => {
            // Setup
            const userWithoutOrg = {
                ...mockExistingUser,
                organization: {} // No organization to avoid lookup
            };
            mockUserCollection.aggregate.mockResolvedValue([userWithoutOrg]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return user with dataCommonsDisplayNames', async () => {
            // Setup
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);

            // Execute
            const result = await userInitializationService.getMyUser(params, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
            expect(result.dataCommonsDisplayNames).toEqual(['commons1']);
        });
    });
}); 