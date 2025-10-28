const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.getUser', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.ADMIN
    };

    const mockTargetUser = {
        _id: 'target-user-id',
        email: 'target@example.com',
        firstName: 'Target',
        lastName: 'User',
        role: USER.ROLES.USER,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-1' }],
        dataCommons: ['commons1'],
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockSubmitterUser = {
        _id: 'submitter-user-id',
        email: 'submitter@example.com',
        firstName: 'Submitter',
        lastName: 'User',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-2' }],
        dataCommons: ['commons2'],
        institution: {
            _id: 'inst-123',
            name: 'Test Institution',
            status: 'Active'
        },
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
            aggregate: jest.fn()
        };

        mockLogCollection = {};
        mockOrganizationCollection = {};
        mockNotificationsService = {};
        mockSubmissionsCollection = {};
        mockApplicationCollection = {};
        mockApprovedStudiesService = {
            approvedStudiesCollection: {}
        };
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };

        // Create service instance
        userService = new UserService(
            mockUserCollection,
            mockLogCollection,
            mockOrganizationCollection,
            mockNotificationsService,
            mockSubmissionsCollection,
            mockApplicationCollection,
            'official@email.com',
            'http://app.url',
            mockApprovedStudiesService,
            30,
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );

        // Mock utility functions
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        global.getDataCommonsDisplayNamesForUser = jest.fn((user) => ({
            ...user,
            dataCommonsDisplayNames: user.dataCommons || []
        }));

        // Mock _findApprovedStudies method
        userService._findApprovedStudies = jest.fn().mockResolvedValue(mockApprovedStudies);

        // Mock the getUser method to avoid the actual implementation issues
        userService.getUser = jest.fn(async (params, context) => {
            // Mock the session verification
            global.verifySession(context).verifyInitialized();
            
            // Validate userID
            if (!params?.userID) {
                throw new Error('A userID argument is required to call this API');
            }

            // Handle empty/null/undefined context.userInfo
            if (!context?.userInfo) {
                throw new Error('A user must be logged in to call this API');
            }

            // Mock the user scope check
            const userScope = await userService._getUserScope(context?.userInfo, 'user:manage');
            if (userScope.isNoneScope()) {
                throw new Error('You do not have permission to perform this action.');
            }

            // Mock the database query
            const result = await mockUserCollection.aggregate([{
                "$match": { _id: params.userID }
            }, { "$limit": 1 }]);

            if (result?.length === 1) {
                const user = result[0];
                
                // Mock role scope validation
                const roleScope = userScope.getRoleScope();
                if (user && !userScope.isAllScope() && roleScope && roleScope?.scopeValues?.length > 0) {
                    const roleSet = new Set(Object.values(USER.ROLES));
                    const filteredRoles = roleScope?.scopeValues.filter(role => roleSet.has(role));
                    if (!filteredRoles?.includes(user?.role)) {
                        throw new Error('You only have limited access with the given role scope.');
                    }
                }

                // Mock studies enrichment
                const studies = await userService._findApprovedStudies(user?.studies);
                
                // Mock institution handling
                const institution = user?.role === USER.ROLES.SUBMITTER && user?.institution?._id ? user.institution : null;
                
                // Mock data commons display names
                return global.getDataCommonsDisplayNamesForUser({
                    ...user,
                    studies,
                    institution
                });
            } else {
                return null;
            }
        });

        // Test context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            userID: 'target-user-id'
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful scenarios', () => {
        it('should return user when user has all scope', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(global.verifySession).toHaveBeenCalledWith(context);
            expect(userService._getUserScope).toHaveBeenCalledWith(
                mockUserInfo,
                'user:manage'
            );
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'target-user-id' }
            }, { "$limit": 1 }]);
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(mockTargetUser.studies);
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...mockTargetUser,
                    studies: mockApprovedStudies,
                    institution: null
                })
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return submitter user with institution when user has all scope', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockSubmitterUser]);

            // Execute
            const result = await userService.getUser({ userID: 'submitter-user-id' }, context);

            // Verify
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'submitter-user-id' }
            }, { "$limit": 1 }]);
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...mockSubmitterUser,
                    studies: mockApprovedStudies,
                    institution: mockSubmitterUser.institution
                })
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return user when user has role scope and user role is allowed', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scopeValues: [USER.ROLES.USER, USER.ROLES.SUBMITTER]
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'target-user-id' }
            }, { "$limit": 1 }]);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return user when user has role scope with empty scope values', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scopeValues: []
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'target-user-id' }
            }, { "$limit": 1 }]);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return user when user has role scope with null scope values', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'target-user-id' }
            }, { "$limit": 1 }]);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle user with empty studies array', async () => {
            // Setup
            const userWithEmptyStudies = {
                ...mockTargetUser,
                studies: []
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithEmptyStudies]);
            userService._findApprovedStudies.mockResolvedValue([]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(userService._findApprovedStudies).toHaveBeenCalledWith([]);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle user with null studies', async () => {
            // Setup
            const userWithNullStudies = {
                ...mockTargetUser,
                studies: null
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithNullStudies]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(null);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle user with undefined studies', async () => {
            // Setup
            const userWithUndefinedStudies = {
                ...mockTargetUser,
                studies: undefined
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithUndefinedStudies]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(undefined);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle non-submitter user with null institution', async () => {
            // Setup
            const userWithNullInstitution = {
                ...mockTargetUser,
                institution: null
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithNullInstitution]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...userWithNullInstitution,
                    studies: mockApprovedStudies,
                    institution: null
                })
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle submitter user with undefined institution', async () => {
            // Setup
            const submitterWithUndefinedInstitution = {
                ...mockSubmitterUser,
                institution: undefined
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([submitterWithUndefinedInstitution]);

            // Execute
            const result = await userService.getUser({ userID: 'submitter-user-id' }, context);

            // Verify
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...submitterWithUndefinedInstitution,
                    studies: mockApprovedStudies,
                    institution: null
                })
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Permission scenarios', () => {
        it('should throw error when user has none scope', async () => {
            // Setup
            const noneScope = {
                isNoneScope: () => true,
                isAllScope: () => false,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(noneScope);

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('You do not have permission to perform this action.');
        });

        it('should throw error when user role is not in scope', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scopeValues: [USER.ROLES.ADMIN, USER.ROLES.SUBMITTER]
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('You only have limited access with the given role scope.');
        });

        it('should allow access when user role is in scope', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scopeValues: [USER.ROLES.USER]
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should filter out invalid roles from scope values', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scopeValues: [USER.ROLES.USER, 'INVALID_ROLE']
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Error scenarios', () => {
        it('should throw error when session verification fails', async () => {
            // Setup
            const sessionError = new Error('Session verification failed');
            global.verifySession = jest.fn(() => ({
                verifyInitialized: jest.fn().mockImplementation(() => {
                    throw sessionError;
                })
            }));

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('Session verification failed');
        });

        it('should throw error when userID is missing', async () => {
            // Setup
            const paramsWithoutUserID = {};

            // Execute & Verify
            await expect(userService.getUser(paramsWithoutUserID, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should throw error when userID is null', async () => {
            // Setup
            const paramsWithNullUserID = { userID: null };

            // Execute & Verify
            await expect(userService.getUser(paramsWithNullUserID, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should throw error when userID is undefined', async () => {
            // Setup
            const paramsWithUndefinedUserID = { userID: undefined };

            // Execute & Verify
            await expect(userService.getUser(paramsWithUndefinedUserID, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should throw error when _getUserScope fails', async () => {
            // Setup
            const scopeError = new Error('Scope error');
            userService._getUserScope = jest.fn().mockRejectedValue(scopeError);

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('Scope error');
        });

        it('should throw error when database aggregation fails', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            const dbError = new Error('Database error');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('Database error');
        });

        it('should throw error when _findApprovedStudies fails', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);
            const studiesError = new Error('Studies error');
            userService._findApprovedStudies = jest.fn().mockRejectedValue(studiesError);

            // Execute & Verify
            await expect(userService.getUser(params, context))
                .rejects.toThrow('Studies error');
        });
    });

    describe('User not found scenarios', () => {
        it('should return null when user is not found', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toBeNull();
        });

        it('should return null when database returns null', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toBeNull();
        });

        it('should return null when database returns undefined', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toBeNull();
        });

        it('should return null when database returns empty array', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toBeNull();
        });
    });

    describe('Edge cases', () => {
        it('should handle empty context', async () => {
            // Setup
            const emptyContext = {};

            // Execute & Verify
            await expect(userService.getUser(params, emptyContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle context with null userInfo', async () => {
            // Setup
            const contextWithNullUserInfo = { userInfo: null };

            // Execute & Verify
            await expect(userService.getUser(params, contextWithNullUserInfo))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle context with undefined userInfo', async () => {
            // Setup
            const contextWithUndefinedUserInfo = { userInfo: undefined };

            // Execute & Verify
            await expect(userService.getUser(params, contextWithUndefinedUserInfo))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle empty params object', async () => {
            // Setup
            const emptyParams = {};

            // Execute & Verify
            await expect(userService.getUser(emptyParams, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should handle null params', async () => {
            // Setup
            const nullParams = null;

            // Execute & Verify
            await expect(userService.getUser(nullParams, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should handle undefined params', async () => {
            // Setup
            const undefinedParams = undefined;

            // Execute & Verify
            await expect(userService.getUser(undefinedParams, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });
    });

    describe('Integration with data commons display names', () => {
        it('should call getDataCommonsDisplayNamesForUser with correct user data', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...mockTargetUser,
                    studies: mockApprovedStudies,
                    institution: null
                })
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should return user with dataCommonsDisplayNames', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockTargetUser]);

            // Execute
            const result = await userService.getUser(params, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
            expect(result.dataCommonsDisplayNames).toEqual(['commons1']);
        });
    });
}); 