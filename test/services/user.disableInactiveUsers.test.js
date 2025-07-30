// Mock the time-utility module before importing UserService
jest.mock('../../crdc-datahub-database-drivers/utility/time-utility', () => ({
    getCurrentTime: jest.fn(() => new Date('2023-12-01T00:00:00Z')),
    subtractDaysFromNowTimestamp: jest.fn()
}));

const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.disableInactiveUsers', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockInactiveUsers = [
        {
            _id: 'user-1',
            email: 'user1@example.com',
            firstName: 'User',
            lastName: 'One',
            role: USER.ROLES.SUBMITTER,
            userStatus: USER.STATUSES.ACTIVE,
            IDP: 'google',
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
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
            userStatus: USER.STATUSES.ACTIVE,
            IDP: 'microsoft',
            studies: [{ _id: 'study-2' }],
            dataCommons: ['commons-2'],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
    ];

    const mockNIHUser = {
        _id: 'nih-user',
        email: 'nih.user@nih.gov',
        firstName: 'NIH',
        lastName: 'User',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        IDP: 'nih',
        studies: [{ _id: 'study-nih' }],
        dataCommons: ['commons-nih'],
        createdAt: '2023-01-03T00:00:00Z',
        updateAt: '2023-01-03T00:00:00Z'
    };

    const mockAlreadyInactiveUser = {
        _id: 'inactive-user',
        email: 'inactive.user@example.com',
        firstName: 'Inactive',
        lastName: 'User',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.INACTIVE,
        IDP: 'google',
        studies: [{ _id: 'study-inactive' }],
        dataCommons: ['commons-inactive'],
        createdAt: '2023-01-04T00:00:00Z',
        updateAt: '2023-01-04T00:00:00Z'
    };

    beforeEach(() => {
        // Mock all dependencies
        mockUserCollection = {
            updateMany: jest.fn(),
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

        // Get the mocked getCurrentTime function
        const { getCurrentTime } = require('../../crdc-datahub-database-drivers/utility/time-utility');
        global.getCurrentTime = getCurrentTime;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('successful scenarios', () => {
        it('should disable inactive users when they exist', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' },
                { email: 'user2@example.com', IDP: 'microsoft' }
            ];
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            const expectedUpdate = {
                userStatus: USER.STATUSES.INACTIVE,
                updateAt: new Date('2023-12-01T00:00:00Z')
            };
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 2,
                matchedCount: 2
            });
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expectedUpdate);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should return empty array when no users are modified', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'nonexistent@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 0,
                matchedCount: 0
            });

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should return empty array when modifiedCount is null', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: null,
                matchedCount: 1
            });

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should return empty array when modifiedCount is undefined', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                matchedCount: 1
            });

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });
    });

    describe('input validation', () => {
        it('should return empty array when inactiveUsers is null', async () => {
            // Act
            const result = await userService.disableInactiveUsers(null);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).not.toHaveBeenCalled();
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should return empty array when inactiveUsers is undefined', async () => {
            // Act
            const result = await userService.disableInactiveUsers(undefined);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).not.toHaveBeenCalled();
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should return empty array when inactiveUsers is empty array', async () => {
            // Act
            const result = await userService.disableInactiveUsers([]);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).not.toHaveBeenCalled();
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should return empty array when inactiveUsers has length 0', async () => {
            // Act
            const result = await userService.disableInactiveUsers([]);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).not.toHaveBeenCalled();
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });
    });

    describe('query structure validation', () => {
        it('should build correct query with $or and IDP exclusion', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' },
                { email: 'user2@example.com', IDP: 'microsoft' }
            ];
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 2,
                matchedCount: 2
            });
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should exclude NIH users from the query', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' },
                { email: 'nih.user@nih.gov', IDP: 'nih' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
            // NIH user should be excluded by the IDP filter
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should use correct update object with INACTIVE status and timestamp', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            const expectedUpdate = {
                userStatus: USER.STATUSES.INACTIVE,
                updateAt: new Date('2023-12-01T00:00:00Z')
            };
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expect.any(Object), expectedUpdate);
        });
    });

    describe('error handling', () => {
        it('should propagate database update errors', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            const dbError = new Error('Database connection failed');
            mockUserCollection.updateMany.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.disableInactiveUsers(inactiveUserConditions)).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });

        it('should propagate database aggregate errors', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            const dbError = new Error('Aggregate query failed');
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.disableInactiveUsers(inactiveUserConditions)).rejects.toThrow('Aggregate query failed');
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from aggregate', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from aggregate', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('performance and behavior', () => {
        it('should call updateMany only once per invocation', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
        });

        it('should call aggregate only when users are modified', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should not call aggregate when no users are modified', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 0,
                matchedCount: 0
            });

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(mockUserCollection.aggregate).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle single user condition', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([mockInactiveUsers[0]]);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple user conditions', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' },
                { email: 'user2@example.com', IDP: 'microsoft' },
                { email: 'user3@example.com', IDP: 'github' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 3,
                matchedCount: 3
            });
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            expect(mockUserCollection.updateMany).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle complex user conditions', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google', role: USER.ROLES.SUBMITTER },
                { email: 'user2@example.com', IDP: 'microsoft', userStatus: USER.STATUSES.ACTIVE },
                { 
                    email: 'user3@example.com', 
                    IDP: 'github', 
                    studies: [{ _id: 'study-1' }],
                    dataCommons: ['commons-1']
                }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 3,
                matchedCount: 3
            });
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
        });
    });

    describe('NIH user exclusion', () => {
        it('should exclude NIH users from being disabled', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'nih.user@nih.gov', IDP: 'nih' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 0,
                matchedCount: 0
            });

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([]);
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
            // NIH user should be excluded by the IDP filter
        });

        it('should handle mixed NIH and non-NIH users', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' },
                { email: 'nih.user@nih.gov', IDP: 'nih' },
                { email: 'user2@example.com', IDP: 'microsoft' }
            ];
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 2,
                matchedCount: 2
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0], mockInactiveUsers[1]]);

            // Act
            const result = await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            expect(result).toEqual([mockInactiveUsers[0], mockInactiveUsers[1]]);
            const expectedQuery = {
                "$or": inactiveUserConditions,
                IDP: { $ne: 'nih' }
            };
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
            // Only non-NIH users should be affected
        });
    });

    describe('integration scenarios', () => {
        it('should work with getCurrentTime function', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            const mockTime = new Date('2023-12-01T12:00:00Z');
            const { getCurrentTime } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            getCurrentTime.mockReturnValue(mockTime);
            
            mockUserCollection.updateMany.mockResolvedValue({
                modifiedCount: 1,
                matchedCount: 1
            });
            mockUserCollection.aggregate.mockResolvedValue([mockInactiveUsers[0]]);

            // Act
            await userService.disableInactiveUsers(inactiveUserConditions);

            // Assert
            const expectedUpdate = {
                userStatus: USER.STATUSES.INACTIVE,
                updateAt: mockTime
            };
            expect(mockUserCollection.updateMany).toHaveBeenCalledWith(expect.any(Object), expectedUpdate);
            expect(getCurrentTime).toHaveBeenCalled();
        });

        it('should handle getCurrentTime errors gracefully', async () => {
            // Arrange
            const inactiveUserConditions = [
                { email: 'user1@example.com', IDP: 'google' }
            ];
            const { getCurrentTime } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            getCurrentTime.mockImplementation(() => {
                throw new Error('Time service unavailable');
            });

            // Act & Assert
            await expect(userService.disableInactiveUsers(inactiveUserConditions)).rejects.toThrow('Time service unavailable');
            expect(mockUserCollection.updateMany).not.toHaveBeenCalled();
        });
    });
}); 