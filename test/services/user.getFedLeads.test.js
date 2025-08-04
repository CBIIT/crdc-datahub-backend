const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.getFedLeads', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockFederalLeads = [
        {
            _id: 'fed-lead-1',
            email: 'federal.lead1@example.com',
            firstName: 'Federal',
            lastName: 'Lead One',
            role: USER.ROLES.FEDERAL_LEAD,
            userStatus: USER.STATUSES.ACTIVE,
            studies: [{ _id: 'study-1' }],
            dataCommons: ['commons-1'],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'fed-lead-2',
            email: 'federal.lead2@example.com',
            firstName: 'Federal',
            lastName: 'Lead Two',
            role: USER.ROLES.FEDERAL_LEAD,
            userStatus: USER.STATUSES.ACTIVE,
            studies: [{ _id: 'study-2' }],
            dataCommons: ['commons-2'],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
    ];

    const mockInactiveFederalLead = {
        _id: 'fed-lead-inactive',
        email: 'federal.lead.inactive@example.com',
        firstName: 'Federal',
        lastName: 'Lead Inactive',
        role: USER.ROLES.FEDERAL_LEAD,
        userStatus: USER.STATUSES.INACTIVE,
        studies: [{ _id: 'study-inactive' }],
        dataCommons: ['commons-inactive'],
        createdAt: '2023-01-03T00:00:00Z',
        updateAt: '2023-01-03T00:00:00Z'
    };

    const mockNonFederalLeadUser = {
        _id: 'non-fed-lead',
        email: 'non.federal@example.com',
        firstName: 'Non',
        lastName: 'Federal',
        role: USER.ROLES.ADMIN,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-admin' }],
        dataCommons: ['commons-admin'],
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
        it('should return federal leads when they exist', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual(mockFederalLeads);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });

        it('should return empty array when no federal leads exist', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });

        it('should return single federal lead when only one exists', async () => {
            // Arrange
            const singleFederalLead = [mockFederalLeads[0]];
            mockUserCollection.aggregate.mockResolvedValue(singleFederalLead);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual(singleFederalLead);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });
    });

    describe('filtering behavior', () => {
        it('should only return users with FEDERAL_LEAD role', async () => {
            // Arrange
            const mixedUsers = [...mockFederalLeads, mockNonFederalLeadUser];
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual(mockFederalLeads);
            expect(result.every(user => user.role === USER.ROLES.FEDERAL_LEAD)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });

        it('should only return users with ACTIVE status', async () => {
            // Arrange
            const mixedStatusUsers = [...mockFederalLeads, mockInactiveFederalLead];
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual(mockFederalLeads);
            expect(result.every(user => user.userStatus === USER.STATUSES.ACTIVE)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });

        it('should filter by both role and status correctly', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toEqual(mockFederalLeads);
            expect(result.every(user => 
                user.role === USER.ROLES.FEDERAL_LEAD && 
                user.userStatus === USER.STATUSES.ACTIVE
            )).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
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
            await expect(userService.getFedLeads()).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from database', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toBeNull();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from database', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.getFedLeads();

            // Assert
            expect(result).toBeUndefined();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('query structure validation', () => {
        it('should use correct MongoDB aggregation pipeline', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            await userService.getFedLeads();

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }]);
        });

        it('should use correct USER constants', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            await userService.getFedLeads();

            // Assert
            const expectedQuery = [{
                "$match": {
                    role: USER.ROLES.FEDERAL_LEAD,
                    userStatus: USER.STATUSES.ACTIVE
                }
            }];
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith(expectedQuery);
        });
    });

    describe('performance and behavior', () => {
        it('should call aggregate only once per invocation', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            await userService.getFedLeads();

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return the same result on multiple calls with same data', async () => {
            // Arrange
            mockUserCollection.aggregate.mockResolvedValue(mockFederalLeads);

            // Act
            const result1 = await userService.getFedLeads();
            const result2 = await userService.getFedLeads();

            // Assert
            expect(result1).toEqual(result2);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });
}); 