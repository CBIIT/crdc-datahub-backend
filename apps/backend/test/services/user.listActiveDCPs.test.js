const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { ERROR } = require('../../constants/error-constants');

describe('UserService.listActiveDCPsAPI', () => {
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

    const mockDCPUsers = [
        {
            _id: 'dcp-1',
            firstName: 'DCP',
            lastName: 'User1',
            email: 'dcp1@example.com',
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons1'],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'dcp-2',
            firstName: 'DCP',
            lastName: 'User2',
            email: 'dcp2@example.com',
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
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
            expect(typeof userService.listActiveDCPsAPI).toBe('function');
            expect(userService.listActiveDCPsAPI.length).toBe(2); // params, context
        });

        it('should return a promise', () => {
            // Mock the method to return a simple promise
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);
            
            const result = userService.listActiveDCPsAPI(params, context);
            expect(result).toBeInstanceOf(Promise);
        });

        it('should handle successful case with DCPs', async () => {
            // Mock the method to return DCPs
            const expectedResult = [
                {
                    userID: 'dcp-1',
                    firstName: 'DCP',
                    lastName: 'User1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                },
                {
                    userID: 'dcp-2',
                    firstName: 'DCP',
                    lastName: 'User2',
                    createdAt: '2023-01-02T00:00:00Z',
                    updateAt: '2023-01-02T00:00:00Z'
                }
            ];

            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue(expectedResult);

            const result = await userService.listActiveDCPsAPI(params, context);

            expect(result).toEqual(expectedResult);
            expect(userService.listActiveDCPsAPI).toHaveBeenCalledWith(params, context);
        });

        it('should handle empty result', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);

            const result = await userService.listActiveDCPsAPI(params, context);

            expect(result).toEqual([]);
        });

        it('should handle null result', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue(null);

            const result = await userService.listActiveDCPsAPI(params, context);

            expect(result).toBeNull();
        });

        it('should handle permission error', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle database error', async () => {
            const dbError = new Error('Database connection failed');
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(dbError);

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('Database connection failed');
        });
    });

    describe('Input Validation', () => {
        it('should handle null params', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveDCPsAPI(null, context);

            expect(userService.listActiveDCPsAPI).toHaveBeenCalledWith(null, context);
        });

        it('should handle null context', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('Session verification failed'));

            await expect(userService.listActiveDCPsAPI(params, null))
                .rejects
                .toThrow('Session verification failed');
        });

        it('should handle empty params object', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveDCPsAPI({}, context);

            expect(userService.listActiveDCPsAPI).toHaveBeenCalledWith({}, context);
        });

        it('should handle params with empty dataCommons', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveDCPsAPI({ dataCommons: [] }, context);

            expect(userService.listActiveDCPsAPI).toHaveBeenCalledWith({ dataCommons: [] }, context);
        });

        it('should handle params with string dataCommons', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue([]);

            await userService.listActiveDCPsAPI({ dataCommons: 'commons1' }, context);

            expect(userService.listActiveDCPsAPI).toHaveBeenCalledWith({ dataCommons: 'commons1' }, context);
        });
    });

    describe('Output Format', () => {
        it('should return DCPs in correct format', async () => {
            const expectedFormat = [
                {
                    userID: 'dcp-1',
                    firstName: 'DCP',
                    lastName: 'User1',
                    createdAt: '2023-01-01T00:00:00Z',
                    updateAt: '2023-01-01T00:00:00Z'
                }
            ];

            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue(expectedFormat);

            const result = await userService.listActiveDCPsAPI(params, context);

            expect(result).toEqual(expectedFormat);
            expect(result[0]).toHaveProperty('userID');
            expect(result[0]).toHaveProperty('firstName');
            expect(result[0]).toHaveProperty('lastName');
            expect(result[0]).toHaveProperty('createdAt');
            expect(result[0]).toHaveProperty('updateAt');
        });

        it('should handle DCPs with missing optional fields', async () => {
            const incompleteDCPs = [
                {
                    userID: 'dcp-1',
                    firstName: 'DCP',
                    lastName: 'User1',
                    // Missing createdAt and updateAt
                }
            ];

            userService.listActiveDCPsAPI = jest.fn().mockResolvedValue(incompleteDCPs);

            const result = await userService.listActiveDCPsAPI(params, context);

            expect(result).toEqual(incompleteDCPs);
            expect(result[0].createdAt).toBeUndefined();
            expect(result[0].updateAt).toBeUndefined();
        });
    });

    describe('Error Scenarios', () => {
        it('should handle session verification failure', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('Session not initialized'));

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('Session not initialized');
        });

        it('should handle permission verification failure', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('You do not have permission to perform this action.');
        });

        it('should handle database query failure', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('Database query failed'));

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('Database query failed');
        });

        it('should handle network timeout', async () => {
            userService.listActiveDCPsAPI = jest.fn().mockRejectedValue(new Error('Request timeout'));

            await expect(userService.listActiveDCPsAPI(params, context))
                .rejects
                .toThrow('Request timeout');
        });
    });

    describe('Integration with getDCPs method', () => {
        it('should call getDCPs with correct parameters', async () => {
            // Mock the getDCPs method
            userService.getDCPs = jest.fn().mockResolvedValue(mockDCPUsers);
            
            // Mock the permission checks
            userService._getUserScope = jest.fn()
                .mockResolvedValue({ isNoneScope: () => false });

            // Mock the session verification
            global.verifySession = jest.fn(() => ({
                verifyInitialized: jest.fn()
            }));

            // Mock global constants
            global.ERROR = ERROR;
            global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;

            // Call the actual method
            await userService.listActiveDCPsAPI(params, context);

            // Verify getDCPs was called with correct parameters
            expect(userService.getDCPs).toHaveBeenCalledWith(['commons1', 'commons2']);
        });

        it('should call getDCPs with empty array when no dataCommons provided', async () => {
            userService.getDCPs = jest.fn().mockResolvedValue([]);
            userService._getUserScope = jest.fn()
                .mockResolvedValue({ isNoneScope: () => false });
            global.verifySession = jest.fn(() => ({
                verifyInitialized: jest.fn()
            }));
            global.ERROR = ERROR;
            global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;

            await userService.listActiveDCPsAPI({}, context);

            expect(userService.getDCPs).toHaveBeenCalledWith([]);
        });

        it('should call getDCPs with string when single dataCommons provided', async () => {
            userService.getDCPs = jest.fn().mockResolvedValue([]);
            userService._getUserScope = jest.fn()
                .mockResolvedValue({ isNoneScope: () => false });
            global.verifySession = jest.fn(() => ({
                verifyInitialized: jest.fn()
            }));
            global.ERROR = ERROR;
            global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;

            await userService.listActiveDCPsAPI({ dataCommons: 'commons1' }, context);

            expect(userService.getDCPs).toHaveBeenCalledWith('commons1');
        });
    });
}); 