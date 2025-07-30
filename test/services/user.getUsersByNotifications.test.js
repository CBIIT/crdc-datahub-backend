const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.getUsersByNotifications', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockUsersWithNotifications = [
        {
            _id: 'user-1',
            email: 'user1@example.com',
            firstName: 'User',
            lastName: 'One',
            role: USER.ROLES.ADMIN,
            userStatus: USER.STATUSES.ACTIVE,
            notifications: ['email_notifications', 'system_notifications', 'submission_notifications'],
            studies: [{ _id: 'study-1' }],
            dataCommons: ['commons-1'],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'user-2',
            email: 'user2@example.com',
            firstName: 'User',
            lastName: 'Two',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            notifications: ['email_notifications', 'submission_notifications'],
            studies: [{ _id: 'study-2' }],
            dataCommons: ['commons-2'],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
    ];

    const mockUsersWithDifferentNotifications = [
        {
            _id: 'user-3',
            email: 'user3@example.com',
            firstName: 'User',
            lastName: 'Three',
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
            userStatus: USER.STATUSES.ACTIVE,
            notifications: ['admin_notifications', 'data_commons_notifications'],
            studies: [{ _id: 'study-3' }],
            dataCommons: ['commons-3'],
            createdAt: '2023-01-03T00:00:00Z',
            updateAt: '2023-01-03T00:00:00Z'
        }
    ];

    const mockInactiveUser = {
        _id: 'user-inactive',
        email: 'user.inactive@example.com',
        firstName: 'User',
        lastName: 'Inactive',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.INACTIVE,
        notifications: ['email_notifications'],
        studies: [{ _id: 'study-inactive' }],
        dataCommons: ['commons-inactive'],
        createdAt: '2023-01-04T00:00:00Z',
        updateAt: '2023-01-04T00:00:00Z'
    };

    const mockUserWithoutNotifications = {
        _id: 'user-no-notifications',
        email: 'user.no.notifications@example.com',
        firstName: 'User',
        lastName: 'NoNotifications',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        notifications: [],
        studies: [{ _id: 'study-no-notifications' }],
        dataCommons: ['commons-no-notifications'],
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
        it('should return users with matching notifications', async () => {
            // Arrange
            const notifications = ['email_notifications', 'submission_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should return empty array when no users match notifications', async () => {
            // Arrange
            const notifications = ['nonexistent_notification'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return single user when only one matches', async () => {
            // Arrange
            const notifications = ['admin_notifications'];
            const singleUser = [mockUsersWithDifferentNotifications[0]];
            
            mockUserCollection.aggregate.mockResolvedValue(singleUser);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(singleUser);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should filter by both notifications and roles when roles are provided', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN];
            
            mockUserCollection.aggregate.mockResolvedValue([mockUsersWithNotifications[0]]);

            // Act
            const result = await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(result).toEqual([mockUsersWithNotifications[0]]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    },
                    "role": {
                        "$in": roles
                    }
                }
            }]);
        });
    });

    describe('query structure validation', () => {
        it('should build correct aggregation pipeline with notifications only', async () => {
            // Arrange
            const notifications = ['email_notifications', 'system_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            const expectedQuery = {
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            };
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([expectedQuery]);
        });

        it('should build correct aggregation pipeline with notifications and roles', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN, USER.ROLES.SUBMITTER];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            const expectedQuery = {
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    },
                    "role": {
                        "$in": roles
                    }
                }
            };
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([expectedQuery]);
        });

        it('should use correct USER constants in query', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });
    });

    describe('input handling', () => {
        it('should handle single notification', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle multiple notifications', async () => {
            // Arrange
            const notifications = ['email_notifications', 'system_notifications', 'submission_notifications', 'admin_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle empty notifications array', async () => {
            // Arrange
            const notifications = [];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle single role in roles array', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN];
            
            mockUserCollection.aggregate.mockResolvedValue([mockUsersWithNotifications[0]]);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    },
                    "role": {
                        "$in": roles
                    }
                }
            }]);
        });

        it('should handle multiple roles in roles array', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN, USER.ROLES.SUBMITTER, USER.ROLES.DATA_COMMONS_PERSONNEL];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    },
                    "role": {
                        "$in": roles
                    }
                }
            }]);
        });

        it('should handle empty roles array', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle undefined roles parameter', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, undefined);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle null roles parameter', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, null);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });
    });

    describe('filtering behavior', () => {
        it('should only include active users', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should filter by notifications using $in operator', async () => {
            // Arrange
            const notifications = ['email_notifications', 'system_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should filter by roles using $in operator when roles are provided', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN, USER.ROLES.SUBMITTER];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    },
                    "role": {
                        "$in": roles
                    }
                }
            }]);
        });

        it('should not include role filter when roles array is empty', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });
    });

    describe('error handling', () => {
        it('should propagate database errors', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const dbError = new Error('Database connection failed');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.getUsersByNotifications(notifications)).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from database', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toBeNull();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from database', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toBeUndefined();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('performance and behavior', () => {
        it('should call aggregate only once per invocation', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return the same result on multiple calls with same data', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result1 = await userService.getUsersByNotifications(notifications);
            const result2 = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result1).toEqual(result2);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });

    describe('edge cases', () => {
        it('should handle users with no notifications', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle users with null notifications', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle users with undefined notifications', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle special characters in notification names', async () => {
            // Arrange
            const notifications = ['email_notifications', 'system-notifications', 'submission_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });

        it('should handle long notification names', async () => {
            // Arrange
            const notifications = ['very_long_notification_name_that_exceeds_normal_length_limits'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            }]);
        });
    });

    describe('business logic validation', () => {
        it('should identify users with specific notification preferences', async () => {
            // Arrange
            const notifications = ['email_notifications', 'submission_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(result.every(user => 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.some(notification => notifications.includes(notification))
            )).toBe(true);
        });

        it('should filter by role when specified', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN];
            
            mockUserCollection.aggregate.mockResolvedValue([mockUsersWithNotifications[0]]);

            // Act
            const result = await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(result).toEqual([mockUsersWithNotifications[0]]);
            expect(result.every(user => 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.includes('email_notifications') &&
                roles.includes(user.role)
            )).toBe(true);
        });

        it('should only return active users', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(result.every(user => user.userStatus === USER.STATUSES.ACTIVE)).toBe(true);
        });

        it('should return users with at least one matching notification', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(result.every(user => 
                user.notifications.some(notification => notifications.includes(notification))
            )).toBe(true);
        });
    });

    describe('comparison with other user retrieval methods', () => {
        it('should use different query structure than getFedLeads', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            await userService.getUsersByNotifications(notifications);

            // Assert
            const expectedQuery = {
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {
                        "$in": notifications
                    }
                }
            };
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([expectedQuery]);
            
            // Verify it's different from getFedLeads query (which filters by role)
            expect(expectedQuery.$match).toHaveProperty('notifications');
            expect(expectedQuery.$match).not.toHaveProperty('role');
        });

        it('should return array format consistent with other user retrieval methods', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('_id');
            expect(result[0]).toHaveProperty('email');
            expect(result[0]).toHaveProperty('role');
            expect(result[0]).toHaveProperty('userStatus');
            expect(result[0]).toHaveProperty('notifications');
        });
    });

    describe('notification-specific functionality', () => {
        it('should specifically target users by notification preferences', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(result.every(user => 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.includes('email_notifications')
            )).toBe(true);
        });

        it('should handle multiple notification types', async () => {
            // Arrange
            const notifications = ['email_notifications', 'system_notifications', 'submission_notifications'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockUsersWithNotifications);

            // Act
            const result = await userService.getUsersByNotifications(notifications);

            // Assert
            expect(result).toEqual(mockUsersWithNotifications);
            expect(result.every(user => 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.some(notification => notifications.includes(notification))
            )).toBe(true);
        });

        it('should combine notification and role filtering correctly', async () => {
            // Arrange
            const notifications = ['email_notifications'];
            const roles = [USER.ROLES.ADMIN];
            
            mockUserCollection.aggregate.mockResolvedValue([mockUsersWithNotifications[0]]);

            // Act
            const result = await userService.getUsersByNotifications(notifications, roles);

            // Assert
            expect(result).toEqual([mockUsersWithNotifications[0]]);
            expect(result.every(user => 
                user.userStatus === USER.STATUSES.ACTIVE &&
                user.notifications.includes('email_notifications') &&
                user.role === USER.ROLES.ADMIN
            )).toBe(true);
        });
    });
}); 