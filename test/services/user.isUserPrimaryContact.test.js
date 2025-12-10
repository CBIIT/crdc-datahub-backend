const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const USER_PERMISSION_CONSTANTS = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');

// Mock the user-info-verifier
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));

describe('UserService.isUserPrimaryContact', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, 
        mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, 
        mockOfficialEmail, mockAppUrl, mockApprovedStudiesService, mockInactiveUserDays, 
        mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    const mockUserInfo = {
        _id: 'admin-user-id',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.ADMIN
    };

    const mockTargetUser = {
        _id: 'target-user-id',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: USER.ROLES.DATA_COMMONS_PERSONNEL,
        userStatus: USER.STATUSES.ACTIVE
    };

    const mockPrimaryContactInProgram = [
        {
            _id: 'org-1',
            name: 'Test Organization',
            conciergeID: 'target-user-id',
            conciergeName: 'John Doe',
            conciergeEmail: 'john.doe@example.com'
        }
    ];

    const mockPrimaryContactInStudy = [
        {
            _id: 'study-1',
            name: 'Test Study',
            primaryContactID: 'target-user-id',
            primaryContactName: 'John Doe',
            primaryContactEmail: 'john.doe@example.com'
        }
    ];

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock collections and services
        mockUserCollection = {
            aggregate: jest.fn()
        };
        mockLogCollection = {};
        mockOrganizationCollection = {
            aggregate: jest.fn()
        };
        mockNotificationsService = {};
        mockSubmissionsCollection = {};
        mockApplicationCollection = {};
        mockOfficialEmail = 'test@example.com';
        mockAppUrl = 'http://test.com';
        mockApprovedStudiesService = {
            aggregate: jest.fn(),
            approvedStudiesCollection: {
                aggregate: jest.fn()
            }
        };
        mockInactiveUserDays = 90;
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {};

        // Create user service instance
        userService = new UserService(
            mockUserCollection,
            mockLogCollection,
            mockOrganizationCollection,
            mockNotificationsService,
            mockSubmissionsCollection,
            mockApplicationCollection,
            mockOfficialEmail,
            mockAppUrl,
            mockApprovedStudiesService,
            mockInactiveUserDays,
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );

        // Set up context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            userID: 'target-user-id'
        };

        // Mock getUserByID method
        userService.getUserByID = jest.fn().mockResolvedValue(mockTargetUser);
        
        // Mock _getUserScope method
        userService._getUserScope = jest.fn().mockResolvedValue({
            isNoneScope: () => false
        });
    });

    describe('Function signature', () => {
        it('should be a function', () => {
            expect(typeof userService.isUserPrimaryContact).toBe('function');
        });

        it('should accept two parameters', () => {
            expect(userService.isUserPrimaryContact.length).toBe(2); // params, context
        });
    });

    describe('Parameter validation', () => {
        it('should throw error when context is null', async () => {
            // This test will run the actual implementation which should throw the session error
            await expect(userService.isUserPrimaryContact(params, null))
                .rejects.toThrow();
        });

        it('should throw error when params is empty', async () => {
            await expect(userService.isUserPrimaryContact({}, context))
                .rejects.toThrow();
        });

        it('should throw error when userID is missing', async () => {
            await expect(userService.isUserPrimaryContact({}, context))
                .rejects.toThrow();
        });

        it('should throw error when userID is null', async () => {
            await expect(userService.isUserPrimaryContact({ userID: null }, context))
                .rejects.toThrow();
        });

        it('should throw error when userID is undefined', async () => {
            await expect(userService.isUserPrimaryContact({ userID: undefined }, context))
                .rejects.toThrow();
        });
    });

    describe('Permission validation', () => {
        it('should throw error when user has no permission', async () => {
            userService._getUserScope = jest.fn().mockResolvedValue({
                isNoneScope: () => true
            });

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow();
        });

        it('should call _getUserScope with correct permission', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact(params, context);

            expect(userService._getUserScope).toHaveBeenCalledWith(
                mockUserInfo, 
                USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_USER
            );
        });
    });

    describe('User validation', () => {
        it('should throw error when user does not exist', async () => {
            userService.getUserByID = jest.fn().mockResolvedValue(null);

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow();
        });

        it('should call getUserByID with correct userID', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact(params, context);

            expect(userService.getUserByID).toHaveBeenCalledWith('target-user-id');
        });
    });

    describe('Database queries', () => {
        it('should call organizationCollection.aggregate with correct query', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact(params, context);

            expect(mockOrganizationCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "conciergeID": mockTargetUser._id } },
                { "$limit": 1 }
            ]);
        });

        it('should call approvedStudiesCollection.aggregate with correct query', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact(params, context);

            expect(mockApprovedStudiesService.approvedStudiesCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "primaryContactID": mockTargetUser._id } },
                { "$limit": 1 }
            ]);
        });

        it('should execute both queries in parallel', async () => {
            // Track call order to verify parallel execution structurally
            const callOrder = [];

            mockOrganizationCollection.aggregate = jest.fn().mockImplementation(async () => {
                callOrder.push('org-start');
                await new Promise(resolve => setImmediate(resolve));
                callOrder.push('org-end');
                return [];
            });
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockImplementation(async () => {
                callOrder.push('studies-start');
                await new Promise(resolve => setImmediate(resolve));
                callOrder.push('studies-end');
                return [];
            });

            await userService.isUserPrimaryContact(params, context);

            // Verify parallel execution: both queries started before either ended
            expect(callOrder.indexOf('org-start')).toBeLessThan(callOrder.indexOf('org-end'));
            expect(callOrder.indexOf('org-start')).toBeLessThan(callOrder.indexOf('studies-end'));
            expect(callOrder.indexOf('studies-start')).toBeLessThan(callOrder.indexOf('org-end'));
            expect(callOrder.indexOf('studies-start')).toBeLessThan(callOrder.indexOf('studies-end'));
        });
    });

    describe('Primary contact in program', () => {
        it('should return true when user is primary contact in program', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue(mockPrimaryContactInProgram);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(true);
        });

        it('should return true when user is primary contact in multiple programs', async () => {
            const multiplePrograms = [
                ...mockPrimaryContactInProgram,
                {
                    _id: 'org-2',
                    name: 'Another Organization',
                    conciergeID: 'target-user-id',
                    conciergeName: 'John Doe',
                    conciergeEmail: 'john.doe@example.com'
                }
            ];
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue(multiplePrograms);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(true);
        });
    });

    describe('Primary contact in study', () => {
        it('should return true when user is primary contact in study', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue(mockPrimaryContactInStudy);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(true);
        });

        it('should return true when user is primary contact in multiple studies', async () => {
            const multipleStudies = [
                ...mockPrimaryContactInStudy,
                {
                    _id: 'study-2',
                    name: 'Another Study',
                    primaryContactID: 'target-user-id',
                    primaryContactName: 'John Doe',
                    primaryContactEmail: 'john.doe@example.com'
                }
            ];
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue(multipleStudies);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(true);
        });
    });

    describe('Primary contact in both program and study', () => {
        it('should return true when user is primary contact in both program and study', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue(mockPrimaryContactInProgram);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue(mockPrimaryContactInStudy);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(true);
        });
    });

    describe('Not a primary contact', () => {
        it('should return false when user is not primary contact anywhere', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(false);
        });

        it('should return false when organization query returns empty array', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(false);
        });

        it('should return false when study query returns empty array', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact(params, context);

            expect(result).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle special characters in userID', async () => {
            const specialUserID = 'user-123-with-special-chars!@#$%';
            const specialUser = { ...mockTargetUser, _id: specialUserID };
            userService.getUserByID = jest.fn().mockResolvedValue(specialUser);
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact({ userID: specialUserID }, context);

            expect(mockOrganizationCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "conciergeID": specialUserID } },
                { "$limit": 1 }
            ]);
            expect(mockApprovedStudiesService.approvedStudiesCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "primaryContactID": specialUserID } },
                { "$limit": 1 }
            ]);
        });
    });

    describe('Error handling', () => {
        it('should handle getUserByID throwing an error', async () => {
            userService.getUserByID = jest.fn().mockRejectedValue(new Error('Database error'));

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow('Database error');
        });

        it('should handle _getUserScope throwing an error', async () => {
            userService._getUserScope = jest.fn().mockRejectedValue(new Error('Permission error'));

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow('Permission error');
        });

        it('should handle organizationCollection.aggregate throwing an error', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockRejectedValue(new Error('Organization query error'));

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow('Organization query error');
        });

        it('should handle approvedStudiesService.aggregate throwing an error', async () => {
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockRejectedValue(new Error('Study query error'));

            await expect(userService.isUserPrimaryContact(params, context))
                .rejects.toThrow('Study query error');
        });
    });

    describe('Performance considerations', () => {
        it('should use $limit to optimize queries', async () => {
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            await userService.isUserPrimaryContact(params, context);

            expect(mockOrganizationCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "conciergeID": mockTargetUser._id } },
                { "$limit": 1 }
            ]);
            expect(mockApprovedStudiesService.approvedStudiesCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { "primaryContactID": mockTargetUser._id } },
                { "$limit": 1 }
            ]);
        });

        it('should execute queries in parallel for better performance', async () => {
            // Track call order to verify parallel execution structurally
            const callOrder = [];

            mockOrganizationCollection.aggregate = jest.fn().mockImplementation(async () => {
                callOrder.push('org-start');
                await new Promise(resolve => setImmediate(resolve));
                callOrder.push('org-end');
                return [];
            });
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockImplementation(async () => {
                callOrder.push('studies-start');
                await new Promise(resolve => setImmediate(resolve));
                callOrder.push('studies-end');
                return [];
            });

            await userService.isUserPrimaryContact(params, context);

            // Verify parallel execution: both queries started before either ended
            expect(callOrder.indexOf('org-start')).toBeLessThan(callOrder.indexOf('org-end'));
            expect(callOrder.indexOf('org-start')).toBeLessThan(callOrder.indexOf('studies-end'));
            expect(callOrder.indexOf('studies-start')).toBeLessThan(callOrder.indexOf('org-end'));
            expect(callOrder.indexOf('studies-start')).toBeLessThan(callOrder.indexOf('studies-end'));
        });
    });

    describe('Integration scenarios', () => {
        it('should work with real user data structure', async () => {
            const realUser = {
                _id: 'real-user-123',
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane.smith@example.com',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                userStatus: USER.STATUSES.ACTIVE,
                organization: 'Test Org',
                studies: ['study-1', 'study-2']
            };
            userService.getUserByID = jest.fn().mockResolvedValue(realUser);
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue(mockPrimaryContactInProgram);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact({ userID: 'real-user-123' }, context);

            expect(result).toBe(true);
        });

        it('should handle user with no primary contact roles', async () => {
            const regularUser = {
                _id: 'regular-user-123',
                firstName: 'Bob',
                lastName: 'Johnson',
                email: 'bob.johnson@example.com',
                role: USER.ROLES.SUBMITTER,
                userStatus: USER.STATUSES.ACTIVE
            };
            userService.getUserByID = jest.fn().mockResolvedValue(regularUser);
            mockOrganizationCollection.aggregate = jest.fn().mockResolvedValue([]);
            mockApprovedStudiesService.approvedStudiesCollection.aggregate = jest.fn().mockResolvedValue([]);

            const result = await userService.isUserPrimaryContact({ userID: 'regular-user-123' }, context);

            expect(result).toBe(false);
        });
    });
}); 