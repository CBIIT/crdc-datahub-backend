const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const { LOG_COLLECTION } = require('../../crdc-datahub-database-drivers/database-constants');

// Mock the time-utility module before importing UserService
jest.mock('../../crdc-datahub-database-drivers/utility/time-utility', () => ({
    getCurrentTime: jest.fn(() => new Date('2023-12-01T00:00:00Z')),
    subtractDaysFromNowTimestamp: jest.fn(() => new Date('2023-11-01T00:00:00Z').getTime())
}));

describe('UserService.checkForInactiveUsers', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockInactiveUsers = [
        {
            _id: 'user-1',
            email: 'user1@example.com',
            IDP: 'google',
            firstName: 'User',
            lastName: 'One'
        },
        {
            _id: 'user-2',
            email: 'user2@example.com',
            IDP: 'microsoft',
            firstName: 'User',
            lastName: 'Two'
        }
    ];

    const mockActiveUserWithRecentLogs = {
        _id: 'user-active-recent',
        email: 'user.active.recent@example.com',
        firstName: 'User',
        lastName: 'Active Recent',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        IDP: 'google',
        studies: [{ _id: 'study-1' }],
        dataCommons: ['commons-1'],
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

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

    const mockInactiveUser = {
        _id: 'user-inactive',
        email: 'user.inactive@example.com',
        firstName: 'User',
        lastName: 'Inactive',
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
            30, // inactiveUserDays
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('successful scenarios', () => {
        it('should return inactive users when they exist', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout', 'submission_created'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    $match: expect.objectContaining({
                        userStatus: USER.STATUSES.ACTIVE,
                        IDP: { $not: { $regex: 'nih', $options: 'i' } }
                    })
                }),
                expect.objectContaining({
                    $lookup: expect.objectContaining({
                        from: LOG_COLLECTION,
                        localField: 'email',
                        foreignField: 'userEmail',
                        as: 'log_events_array'
                    })
                })
            ]));
        });

        it('should return empty array when no inactive users exist', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return single inactive user when only one exists', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const singleInactiveUser = [mockInactiveUsers[0]];
            
            mockUserCollection.aggregate.mockResolvedValue(singleInactiveUser);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toEqual(singleInactiveUser);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('pipeline structure validation', () => {
        it('should build correct aggregation pipeline with all stages', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout'];
            const { subtractDaysFromNowTimestamp } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            expect(pipeline).toHaveLength(6); // 6 stages in the pipeline
            
            // Stage 1: Initial $match
            expect(pipeline[0]).toEqual({
                $match: {
                    userStatus: USER.STATUSES.ACTIVE,
                    IDP: { $not: { $regex: 'nih', $options: 'i' } }
                }
            });

            // Stage 2: $lookup
            expect(pipeline[1]).toEqual({
                $lookup: {
                    from: LOG_COLLECTION,
                    localField: 'email',
                    foreignField: 'userEmail',
                    as: 'log_events_array'
                }
            });

            // Stage 3: $set with $filter
            expect(pipeline[2]).toEqual({
                $set: {
                    log_events_array: {
                        $filter: {
                            input: '$log_events_array',
                            as: 'log',
                            cond: {
                                $and: [
                                    {
                                        $eq: ['$$log.userIDP', '$IDP']
                                    },
                                    {
                                        $in: ['$$log.eventType', qualifyingEvents]
                                    }
                                ]
                            }
                        }
                    }
                }
            });

            // Stage 4: $set with $first and $sortArray
            expect(pipeline[3]).toEqual({
                $set: {
                    latest_log_event: {
                        $first: {
                            $sortArray: {
                                input: '$log_events_array',
                                sortBy: {
                                    timestamp: -1
                                }
                            }
                        }
                    }
                }
            });

            // Stage 5: Final $match
            expect(pipeline[4]).toEqual({
                $match: {
                    $or: [
                        {
                            'latest_log_event.timestamp': {
                                $exists: 0
                            }
                        },
                        {
                            'latest_log_event.timestamp': {
                                $lt: subtractDaysFromNowTimestamp(30)
                            }
                        }
                    ]
                }
            });

            // Stage 6: $project
            expect(pipeline[5]).toEqual({
                $project: {
                    _id: 1,
                    email: 1,
                    IDP: 1,
                    firstName: 1
                }
            });
        });

        it('should use correct field names in pipeline', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            
            // Check field names are correctly mapped
            expect(pipeline[0].$match.userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(pipeline[1].$lookup.localField).toBe('email');
            expect(pipeline[1].$lookup.foreignField).toBe('userEmail');
            expect(pipeline[1].$lookup.as).toBe('log_events_array');
        });

        it('should use correct constants in pipeline', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            
            expect(pipeline[0].$match.userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(pipeline[0].$match.IDP).toEqual({ $not: { $regex: 'nih', $options: 'i' } });
            expect(pipeline[1].$lookup.from).toBe(LOG_COLLECTION);
        });
    });

    describe('input handling', () => {
        it('should handle single qualifying event', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const filterStage = pipeline[2].$set.log_events_array.$filter;
            expect(filterStage.cond.$and[1].$in[1]).toEqual(qualifyingEvents);
        });

        it('should handle multiple qualifying events', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout', 'submission_created', 'data_uploaded'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const filterStage = pipeline[2].$set.log_events_array.$filter;
            expect(filterStage.cond.$and[1].$in[1]).toEqual(qualifyingEvents);
        });

        it('should handle empty qualifying events array', async () => {
            // Arrange
            const qualifyingEvents = [];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const filterStage = pipeline[2].$set.log_events_array.$filter;
            expect(filterStage.cond.$and[1].$in[1]).toEqual(qualifyingEvents);
        });
    });

    describe('filtering behavior', () => {
        it('should exclude NIH users from the query', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            expect(pipeline[0].$match.IDP).toEqual({ $not: { $regex: 'nih', $options: 'i' } });
        });

        it('should only include active users', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            expect(pipeline[0].$match.userStatus).toBe(USER.STATUSES.ACTIVE);
        });

        it('should filter log events by IDP match', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const filterStage = pipeline[2].$set.log_events_array.$filter;
            expect(filterStage.cond.$and[0].$eq).toEqual(['$$log.userIDP', '$IDP']);
        });

        it('should filter log events by qualifying events', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const filterStage = pipeline[2].$set.log_events_array.$filter;
            expect(filterStage.cond.$and[1].$in).toEqual(['$$log.eventType', qualifyingEvents]);
        });
    });

    describe('inactive user detection logic', () => {
        it('should include users with no qualifying log events', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            expect(finalMatchStage.$or[0]).toEqual({
                'latest_log_event.timestamp': {
                    $exists: 0
                }
            });
        });

        it('should include users with old qualifying log events', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const { subtractDaysFromNowTimestamp } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            expect(finalMatchStage.$or[1]).toEqual({
                'latest_log_event.timestamp': {
                    $lt: subtractDaysFromNowTimestamp(30)
                }
            });
        });

        it('should use correct inactive user days from constructor', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const { subtractDaysFromNowTimestamp } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            expect(finalMatchStage.$or[1]['latest_log_event.timestamp'].$lt).toBe(subtractDaysFromNowTimestamp(30));
        });
    });

    describe('output projection', () => {
        it('should project only required fields', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const projectStage = pipeline[5].$project;
            expect(projectStage).toEqual({
                _id: 1,
                email: 1,
                IDP: 1,
                firstName: 1
            });
        });

        it('should return users with correct structure', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            expect(result[0]).toHaveProperty('_id');
            expect(result[0]).toHaveProperty('email');
            expect(result[0]).toHaveProperty('IDP');
            expect(result[0]).toHaveProperty('firstName');
        });
    });

    describe('error handling', () => {
        it('should propagate database errors', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const dbError = new Error('Database connection failed');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.checkForInactiveUsers(qualifyingEvents)).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from database', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toBeNull();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from database', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toBeUndefined();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('performance and behavior', () => {
        it('should call aggregate only once per invocation', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return the same result on multiple calls with same data', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result1 = await userService.checkForInactiveUsers(qualifyingEvents);
            const result2 = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result1).toEqual(result2);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });

    describe('edge cases', () => {
        it('should handle users with no log events', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            // Should include users with no qualifying log events
            expect(finalMatchStage.$or[0]['latest_log_event.timestamp'].$exists).toBe(0);
        });

        it('should handle users with log events but none qualifying', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            // Should include users with no qualifying log events
            expect(finalMatchStage.$or[0]['latest_log_event.timestamp'].$exists).toBe(0);
        });

        it('should handle case-insensitive NIH user exclusion', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            expect(pipeline[0].$match.IDP).toEqual({ $not: { $regex: 'nih', $options: 'i' } });
        });
    });

    describe('integration scenarios', () => {
        it('should work with subtractDaysFromNowTimestamp function', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const { subtractDaysFromNowTimestamp } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            expect(finalMatchStage.$or[1]['latest_log_event.timestamp'].$lt).toBe(subtractDaysFromNowTimestamp(30));
            expect(subtractDaysFromNowTimestamp).toHaveBeenCalledWith(30);
        });

        it('should handle different inactive user days configurations', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            const { subtractDaysFromNowTimestamp } = require('../../crdc-datahub-database-drivers/utility/time-utility');
            
            // Create service with different inactiveUserDays
            const userServiceWithDifferentDays = new UserService(
                mockUserCollection,
                mockLogCollection,
                mockOrganizationCollection,
                mockNotificationsService,
                mockSubmissionsCollection,
                mockApplicationCollection,
                'test@example.com',
                'http://test.com',
                mockApprovedStudiesService,
                60, // Different inactiveUserDays
                mockConfigurationService,
                mockInstitutionService,
                mockAuthorizationService
            );
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userServiceWithDifferentDays.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const finalMatchStage = pipeline[4].$match;
            expect(finalMatchStage.$or[1]['latest_log_event.timestamp'].$lt).toBe(subtractDaysFromNowTimestamp(60));
        });
    });

    describe('business logic validation', () => {
        it('should identify users who have been inactive for the specified period', async () => {
            // Arrange
            const qualifyingEvents = ['login', 'logout', 'submission_created'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            const result = await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            expect(result).toEqual(mockInactiveUsers);
            expect(result.every(user => 
                user._id && 
                user.email && 
                user.IDP && 
                user.firstName
            )).toBe(true);
        });

        it('should exclude NIH users from inactivity checks', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const initialMatch = pipeline[0].$match;
            expect(initialMatch.IDP).toEqual({ $not: { $regex: 'nih', $options: 'i' } });
        });

        it('should only consider active users for inactivity checks', async () => {
            // Arrange
            const qualifyingEvents = ['login'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockInactiveUsers);

            // Act
            await userService.checkForInactiveUsers(qualifyingEvents);

            // Assert
            const pipeline = mockUserCollection.aggregate.mock.calls[0][0];
            const initialMatch = pipeline[0].$match;
            expect(initialMatch.userStatus).toBe(USER.STATUSES.ACTIVE);
        });
    });
}); 