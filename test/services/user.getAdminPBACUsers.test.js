const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const { EMAIL_NOTIFICATIONS } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');

describe('UserService.getAdminPBACUsers', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockAdminPBACUsers = [
        {
            _id: 'admin-pbac-1',
            email: 'admin.pbac1@example.com',
            firstName: 'Admin',
            lastName: 'PBAC One',
            role: USER.ROLES.ADMIN,
            userStatus: USER.STATUSES.ACTIVE,
            notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN],
            studies: [{ _id: 'study-1' }],
            dataCommons: ['commons-1'],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'admin-pbac-2',
            email: 'admin.pbac2@example.com',
            firstName: 'Admin',
            lastName: 'PBAC Two',
            role: USER.ROLES.ADMIN,
            userStatus: USER.STATUSES.ACTIVE,
            notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN],
            studies: [{ _id: 'study-2' }],
            dataCommons: ['commons-2'],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
    ];

    const mockAdminWithoutNotification = {
        _id: 'admin-no-notification',
        email: 'admin.no.notification@example.com',
        firstName: 'Admin',
        lastName: 'No Notification',
        role: USER.ROLES.ADMIN,
        userStatus: USER.STATUSES.ACTIVE,
        notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_REQUEST_ACCESS],
        studies: [{ _id: 'study-no-notification' }],
        dataCommons: ['commons-no-notification'],
        createdAt: '2023-01-03T00:00:00Z',
        updateAt: '2023-01-03T00:00:00Z'
    };

    const mockInactiveAdmin = {
        _id: 'admin-inactive',
        email: 'admin.inactive@example.com',
        firstName: 'Admin',
        lastName: 'Inactive',
        role: USER.ROLES.ADMIN,
        userStatus: USER.STATUSES.INACTIVE,
        notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN],
        studies: [{ _id: 'study-inactive' }],
        dataCommons: ['commons-inactive'],
        createdAt: '2023-01-04T00:00:00Z',
        updateAt: '2023-01-04T00:00:00Z'
    };

    const mockNonAdminUser = {
        _id: 'non-admin',
        email: 'non.admin@example.com',
        firstName: 'Non',
        lastName: 'Admin',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN],
        studies: [{ _id: 'study-submitter' }],
        dataCommons: ['commons-submitter'],
        createdAt: '2023-01-05T00:00:00Z',
        updateAt: '2023-01-05T00:00:00Z'
    };

    beforeEach(() => {
        // Mock all dependencies
        mockUserCollection = {
            aggregate: jest.fn()
        };
        mockLogCollection = {};
        mockOrganizationCollection = {};
        mockNotificationsService = {};
        mockSubmissionsCollection = {};
        mockApplicationCollection = {};
        mockApprovedStudiesService = {};
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {};

        // Initialize UserService with mocked dependencies
        userService = new UserService(
            mockUserCollection,
            mockLogCollection,
            mockOrganizationCollection,
            mockNotificationsService,
            mockSubmissionsCollection,
            mockApplicationCollection,
            'test@example.com',
            'http://test.com',
            mockApprovedStudiesService,
            30,
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('successful scenarios', () => {
        it('should return admin PBAC users when they exist', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should return empty array when no admin PBAC users exist', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should return single admin PBAC user when only one exists', async () => {
            // Arrange
            const singleAdminPBAC = [mockAdminPBACUsers[0]];
            mockUserCollection.aggregate.mockResolvedValue(singleAdminPBAC);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(singleAdminPBAC);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });
    });

    describe('filtering behavior', () => {
        it('should only return users with ADMIN role', async () => {
            // Arrange
            const mixedUsers = [...mockAdminPBACUsers, mockNonAdminUser];
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result.every(user => user.role === USER.ROLES.ADMIN)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should only return users with ACTIVE status', async () => {
            // Arrange
            const mixedStatusUsers = [...mockAdminPBACUsers, mockInactiveAdmin];
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result.every(user => user.userStatus === USER.STATUSES.ACTIVE)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should only return users with USER_INACTIVATED_ADMIN notification', async () => {
            // Arrange
            const mixedNotificationUsers = [...mockAdminPBACUsers, mockAdminWithoutNotification];
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result.every(user => 
                user.notifications.includes(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN)
            )).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should filter by all three criteria correctly', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result.every(user => 
                user.role === USER.ROLES.ADMIN && 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.includes(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN)
            )).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });
    });

    describe('error handling', () => {
        it('should propagate database errors', async () => {
            // Arrange
            const dbError = new Error('Database connection failed');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.getAdminPBACUsers()).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from database', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from database', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('query structure validation', () => {
        it('should use correct MongoDB aggregation pipeline', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            await userService.getAdminPBACUsers();

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }]);
        });

        it('should use correct USER constants', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            await userService.getAdminPBACUsers();

            // Assert
            const expectedQuery = [{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }];
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith(expectedQuery);
        });

        it('should use correct EMAIL_NOTIFICATIONS constant', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            await userService.getAdminPBACUsers();

            // Assert
            const expectedQuery = [{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }];
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith(expectedQuery);
            expect(expectedQuery[0].$match.notifications.$in[0]).toBe(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN);
        });
    });

    describe('performance and behavior', () => {
        it('should call aggregate only once per invocation', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            await userService.getAdminPBACUsers();

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return the same result on multiple calls with same data', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result1 = await userService.getAdminPBACUsers();
            const result2 = await userService.getAdminPBACUsers();

            // Assert
            expect(result1).toEqual(result2);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });

    describe('edge cases', () => {
        it('should handle admin PBAC users with minimal data', async () => {
            // Arrange
            const minimalAdminPBAC = [{
                _id: 'minimal-admin-pbac',
                role: USER.ROLES.ADMIN,
                userStatus: USER.STATUSES.ACTIVE,
                notifications: [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]
            }];
            mockUserCollection.aggregate.mockResolvedValue(minimalAdminPBAC);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(minimalAdminPBAC);
            expect(result[0].role).toBe(USER.ROLES.ADMIN);
            expect(result[0].userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(result[0].notifications).toContain(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN);
        });

        it('should handle admin PBAC users with multiple notifications', async () => {
            // Arrange
            const adminWithMultipleNotifications = [{
                _id: 'admin-multiple-notifications',
                email: 'admin.multiple@example.com',
                firstName: 'Admin',
                lastName: 'Multiple Notifications',
                role: USER.ROLES.ADMIN,
                userStatus: USER.STATUSES.ACTIVE,
                notifications: [
                    EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN,
                    EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_REQUEST_ACCESS,
                    EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW
                ],
                studies: [{ _id: 'study-1' }, { _id: 'study-2' }],
                dataCommons: ['commons-1', 'commons-2'],
                institution: { _id: 'inst-1', name: 'Test Institution' },
                permissions: ['admin:manage_users', 'admin:manage_submissions'],
                createdAt: '2023-01-01T00:00:00Z',
                updateAt: '2023-01-01T00:00:00Z',
                lastLoginAt: '2023-12-01T00:00:00Z',
                loginCount: 150,
                isVerified: true,
                preferences: {
                    theme: 'dark',
                    language: 'en',
                    timezone: 'UTC'
                }
            }];
            mockUserCollection.aggregate.mockResolvedValue(adminWithMultipleNotifications);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(adminWithMultipleNotifications);
            expect(result[0].role).toBe(USER.ROLES.ADMIN);
            expect(result[0].userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(result[0].notifications).toContain(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN);
            expect(result[0].notifications).toHaveLength(3);
        });
    });

    describe('comparison with other user retrieval methods', () => {
        it('should use different query structure than getAdmin', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            await userService.getAdminPBACUsers();

            // Assert
            const expectedQuery = [{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
                    "$or": [{"role": USER.ROLES.ADMIN}]
                }
            }];
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith(expectedQuery);
            
            // Verify it's different from getAdmin query
            expect(expectedQuery[0].$match).toHaveProperty('notifications');
            expect(expectedQuery[0].$match).toHaveProperty('$or');
        });

        it('should return array format consistent with other user retrieval methods', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('_id');
            expect(result[0]).toHaveProperty('role');
            expect(result[0]).toHaveProperty('userStatus');
            expect(result[0]).toHaveProperty('notifications');
        });
    });

    describe('PBAC-specific functionality', () => {
        it('should specifically target PBAC admin users', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result.every(user => 
                user.role === USER.ROLES.ADMIN &&
                user.notifications.includes(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN)
            )).toBe(true);
        });

        it('should exclude admin users without PBAC notification', async () => {
            // Arrange
            const allAdmins = [...mockAdminPBACUsers, mockAdminWithoutNotification];
            mockUserCollection.aggregate.mockResolvedValue(mockAdminPBACUsers);

            // Act
            const result = await userService.getAdminPBACUsers();

            // Assert
            expect(result).toEqual(mockAdminPBACUsers);
            expect(result).not.toContain(mockAdminWithoutNotification);
            expect(result.every(user => 
                user.notifications.includes(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN)
            )).toBe(true);
        });
    });
}); 