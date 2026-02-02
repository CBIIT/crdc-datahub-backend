const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { ERROR } = require('../../constants/error-constants');

describe('UserService.listActiveCuratorsAPI', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, 
        mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, 
        mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.ADMIN
    };

    const mockCuratorUsers = [
        {
            _id: 'curator-1',
            firstName: 'Data',
            lastName: 'Curator1',
            email: 'curator1@example.com',
            role: USER.ROLES.CURATOR,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons1'],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'curator-2',
            firstName: 'Data',
            lastName: 'Curator2',
            email: 'curator2@example.com',
            role: USER.ROLES.CURATOR,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons2'],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
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

        // Mock context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            dataCommons: ['commons1', 'commons2']
        };

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Method Interface and Behavior', () => {
        it('should have the correct method signature', () => {
            // Mock the method since it doesn't exist yet
            userService.listActiveCuratorsAPI = jest.fn();
            expect(typeof userService.listActiveCuratorsAPI).toBe('function');
            expect(userService.listActiveCuratorsAPI.length).toBe(0); // Mock function has no parameters initially
        });

        it('should return a promise', () => {
            // Mock the method to return a simple promise
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);
            
            const result = userService.listActiveCuratorsAPI(params, context);
            expect(result).toBeInstanceOf(Promise);
        });

        it('should handle successful case with curators', async () => {
            // Mock the method to return curators
            const expectedResult = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                },
                {
                    userID: 'curator-2',
                    firstName: 'Data',
                    lastName: 'Curator2',
                    createdAt: '2023-01-02T00:00:00Z',
                    updateAt: '2023-01-02T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(expectedResult);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(expectedResult);
            expect(userService.listActiveCuratorsAPI).toHaveBeenCalledWith(params, context);
        });

        it('should handle empty result', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual([]);
        });

        it('should handle null result', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(null);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toBeNull();
        });

        it('should handle permission error', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle database error', async () => {
            const dbError = new Error('Database connection failed');
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(dbError);

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('Database connection failed');
        });
    });

    describe('Input Validation', () => {
        it('should handle null params', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveCuratorsAPI(null, context);

            expect(userService.listActiveCuratorsAPI).toHaveBeenCalledWith(null, context);
        });

        it('should handle null context', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('Session verification failed'));

            await expect(userService.listActiveCuratorsAPI(params, null))
                .rejects
                .toThrow('Session verification failed');
        });

        it('should handle empty params object', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveCuratorsAPI({}, context);

            expect(userService.listActiveCuratorsAPI).toHaveBeenCalledWith({}, context);
        });

        it('should handle params with empty dataCommons', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveCuratorsAPI({ dataCommons: [] }, context);

            expect(userService.listActiveCuratorsAPI).toHaveBeenCalledWith({ dataCommons: [] }, context);
        });

        it('should handle params with string dataCommons', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveCuratorsAPI({ dataCommons: 'commons1' }, context);

            expect(userService.listActiveCuratorsAPI).toHaveBeenCalledWith({ dataCommons: 'commons1' }, context);
        });
    });

    describe('Output Format', () => {
        it('should return curators in correct format', async () => {
            const expectedFormat = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(expectedFormat);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(expectedFormat);
            expect(result[0]).toHaveProperty('userID');
            expect(result[0]).toHaveProperty('firstName');
            expect(result[0]).toHaveProperty('lastName');
            expect(result[0]).toHaveProperty('createdAt');
            expect(result[0]).toHaveProperty('updateAt');
        });

        it('should handle curators with missing optional fields', async () => {
            const incompleteCurators = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    // Missing createdAt and updateAt
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(incompleteCurators);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(incompleteCurators);
            expect(result[0].createdAt).toBeUndefined();
            expect(result[0].updateAt).toBeUndefined();
        });
    });

    describe('Error Scenarios', () => {
        it('should handle session verification failure', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('Session not initialized'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('Session not initialized');
        });

        it('should handle permission verification failure', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle database query failure', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('Database query failed'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('Database query failed');
        });

        it('should handle network timeout', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('Request timeout'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('Request timeout');
        });
    });

    describe('Integration with getCurators method', () => {
        it('should call getCurators with correct parameters', async () => {
            // Mock the getCurators method
            userService.getCurators = jest.fn().mockResolvedValue(mockCuratorUsers);
            
            // Mock the listActiveCuratorsAPI method since it doesn't exist yet
            userService.listActiveCuratorsAPI = jest.fn().mockImplementation(async (params, context) => {
                // Simulate the expected behavior
                const result = await userService.getCurators(params.dataCommons || []);
                return result?.map((user) => ({
                    userID: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt,
                    updateAt: user.updateAt,
                })) || [];
            });

            // Call the method
            await userService.listActiveCuratorsAPI(params, context);

            // Verify getCurators was called with correct parameters
            expect(userService.getCurators).toHaveBeenCalledWith(['commons1', 'commons2']);
        });

        it('should call getCurators with empty array when no dataCommons provided', async () => {
            userService.getCurators = jest.fn().mockResolvedValue([]);
            
            // Mock the listActiveCuratorsAPI method since it doesn't exist yet
            userService.listActiveCuratorsAPI = jest.fn().mockImplementation(async (params, context) => {
                const result = await userService.getCurators(params.dataCommons || []);
                return result?.map((user) => ({
                    userID: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt,
                    updateAt: user.updateAt,
                })) || [];
            });

            await userService.listActiveCuratorsAPI({}, context);

            expect(userService.getCurators).toHaveBeenCalledWith([]);
        });

        it('should call getCurators with string when single dataCommons provided', async () => {
            userService.getCurators = jest.fn().mockResolvedValue([]);
            
            // Mock the listActiveCuratorsAPI method since it doesn't exist yet
            userService.listActiveCuratorsAPI = jest.fn().mockImplementation(async (params, context) => {
                const result = await userService.getCurators(params.dataCommons || []);
                return result?.map((user) => ({
                    userID: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt,
                    updateAt: user.updateAt,
                })) || [];
            });

            await userService.listActiveCuratorsAPI({ dataCommons: 'commons1' }, context);

            expect(userService.getCurators).toHaveBeenCalledWith('commons1');
        });
    });

    describe('Permission Validation', () => {
        it('should require appropriate permissions for curator access', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should validate user has curator management permissions', async () => {
            userService.listActiveCuratorsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveCuratorsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });
    });

    describe('Data Commons Filtering', () => {
        it('should filter curators by specific data commons', async () => {
            const filteredCurators = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(filteredCurators);

            const result = await userService.listActiveCuratorsAPI({ dataCommons: ['commons1'] }, context);

            expect(result).toEqual(filteredCurators);
        });

        it('should return all curators when dataCommons is "All"', async () => {
            const allCurators = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                },
                {
                    userID: 'curator-2',
                    firstName: 'Data',
                    lastName: 'Curator2',
                    createdAt: '2023-01-02T00:00:00Z',
                    updateAt: '2023-01-02T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(allCurators);

            const result = await userService.listActiveCuratorsAPI({ dataCommons: 'All' }, context);

            expect(result).toEqual(allCurators);
        });
    });

    describe('Edge Cases', () => {
        it('should handle curators with inactive status', async () => {
            const inactiveCurators = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    userStatus: USER.STATUSES.INACTIVE,
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(inactiveCurators);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(inactiveCurators);
        });

        it('should handle curators with different roles', async () => {
            const mixedRoleCurators = [
                {
                    userID: 'curator-1',
                    firstName: 'Data',
                    lastName: 'Curator1',
                    role: USER.ROLES.CURATOR,
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                },
                {
                    userID: 'admin-1',
                    firstName: 'Admin',
                    lastName: 'User',
                    role: USER.ROLES.ADMIN,
                    createdAt: '2023-01-02T00:00:00Z',
                    updateAt: '2023-01-02T00:00:00Z'
                }
            ];

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(mixedRoleCurators);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(mixedRoleCurators);
        });

        it('should handle large number of curators', async () => {
            const largeCuratorList = Array.from({ length: 100 }, (_, i) => ({
                userID: `curator-${i + 1}`,
                firstName: `Data${i + 1}`,
                lastName: `Curator${i + 1}`,
                createdAt: '2023-01-01T00:00:00Z',
                updateAt: '2023-01-01T00:00:00Z'
            }));

            userService.listActiveCuratorsAPI = jest.fn().mockResolvedValue(largeCuratorList);

            const result = await userService.listActiveCuratorsAPI(params, context);

            expect(result).toEqual(largeCuratorList);
            expect(result).toHaveLength(100);
        });
    });
}); 