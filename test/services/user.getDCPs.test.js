const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.getDCPs', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;

    const mockDCPs = [
        {
            _id: 'dcp-1',
            email: 'dcp1@example.com',
            firstName: 'DCP',
            lastName: 'One',
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons-1', 'commons-2'],
            studies: [{ _id: 'study-1' }],
            createdAt: '2023-01-01T00:00:00Z',
            updateAt: '2023-01-01T00:00:00Z'
        },
        {
            _id: 'dcp-2',
            email: 'dcp2@example.com',
            firstName: 'DCP',
            lastName: 'Two',
            role: USER.ROLES.DATA_COMMONS_PERSONNEL,
            userStatus: USER.STATUSES.ACTIVE,
            dataCommons: ['commons-2', 'commons-3'],
            studies: [{ _id: 'study-2' }],
            createdAt: '2023-01-02T00:00:00Z',
            updateAt: '2023-01-02T00:00:00Z'
        }
    ];

    const mockInactiveDCP = {
        _id: 'dcp-inactive',
        email: 'dcp.inactive@example.com',
        firstName: 'DCP',
        lastName: 'Inactive',
        role: USER.ROLES.DATA_COMMONS_PERSONNEL,
        userStatus: USER.STATUSES.INACTIVE,
        dataCommons: ['commons-inactive'],
        studies: [{ _id: 'study-inactive' }],
        createdAt: '2023-01-03T00:00:00Z',
        updateAt: '2023-01-03T00:00:00Z'
    };

    const mockNonDCPUser = {
        _id: 'non-dcp',
        email: 'non.dcp@example.com',
        firstName: 'Non',
        lastName: 'DCP',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        dataCommons: ['commons-submitter'],
        studies: [{ _id: 'study-submitter' }],
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
        it('should return DCPs when they exist for specific dataCommons', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should return all DCPs when dataCommons includes "All"', async () => {
            // Arrange
            const dataCommons = ['All'];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL
            };
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should return empty array when no DCPs exist', async () => {
            // Arrange
            const dataCommons = ['commons-nonexistent'];
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return single DCP when only one exists', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            const singleDCP = [mockDCPs[0]];
            
            mockUserCollection.aggregate.mockResolvedValue(singleDCP);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(singleDCP);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('input handling', () => {
        it('should handle string input for dataCommons', async () => {
            // Arrange
            const dataCommons = 'commons-1';
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: [dataCommons] }
            };
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should handle array input for dataCommons', async () => {
            // Arrange
            const dataCommons = ['commons-1', 'commons-2'];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should handle "All" as string input', async () => {
            // Arrange
            const dataCommons = 'All';
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL
            };
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should handle "All" in array input', async () => {
            // Arrange
            const dataCommons = ['commons-1', 'All', 'commons-2'];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL
            };
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });
    });

    describe('filtering behavior', () => {
        it('should only return users with DATA_COMMONS_PERSONNEL role', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(result.every(user => user.role === USER.ROLES.DATA_COMMONS_PERSONNEL)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                    "dataCommons": { $in: dataCommons }
                }
            }]);
        });

        it('should only return users with ACTIVE status', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(result.every(user => user.userStatus === USER.STATUSES.ACTIVE)).toBe(true);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                    "dataCommons": { $in: dataCommons }
                }
            }]);
        });

        it('should filter by dataCommons when not "All"', async () => {
            // Arrange
            const dataCommons = ['commons-1', 'commons-2'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                    "dataCommons": { $in: dataCommons }
                }
            }]);
        });

        it('should not filter by dataCommons when "All" is included', async () => {
            // Arrange
            const dataCommons = ['commons-1', 'All'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL
                }
            }]);
        });
    });

    describe('error handling', () => {
        it('should propagate database errors', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            const dbError = new Error('Database connection failed');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Act & Assert
            await expect(userService.getDCPs(dataCommons)).rejects.toThrow('Database connection failed');
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle null result from database', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toBeNull();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined result from database', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue(undefined);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toBeUndefined();
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });
    });

    describe('query structure validation', () => {
        it('should use correct MongoDB aggregation pipeline', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            await userService.getDCPs(dataCommons);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                    "dataCommons": { $in: dataCommons }
                }
            }]);
        });

        it('should use correct USER constants', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            await userService.getDCPs(dataCommons);

            // Assert
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });
    });

    describe('performance and behavior', () => {
        it('should call aggregate only once per invocation', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            await userService.getDCPs(dataCommons);

            // Assert
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should return the same result on multiple calls with same data', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result1 = await userService.getDCPs(dataCommons);
            const result2 = await userService.getDCPs(dataCommons);

            // Assert
            expect(result1).toEqual(result2);
            expect(mockUserCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });

    describe('edge cases', () => {
        it('should handle empty array input for dataCommons', async () => {
            // Arrange
            const dataCommons = [];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should handle single element array input for dataCommons', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
        });

        it('should handle DCPs with multiple dataCommons', async () => {
            // Arrange
            const dataCommons = ['commons-1', 'commons-2'];
            const dcpWithMultipleCommons = [{
                _id: 'dcp-multiple',
                email: 'dcp.multiple@example.com',
                firstName: 'DCP',
                lastName: 'Multiple',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                userStatus: USER.STATUSES.ACTIVE,
                dataCommons: ['commons-1', 'commons-2', 'commons-3'],
                studies: [{ _id: 'study-1' }, { _id: 'study-2' }],
                institution: { _id: 'inst-1', name: 'Test Institution' },
                permissions: ['dcp:manage_data', 'dcp:review_submissions'],
                notifications: ['email_notifications', 'system_notifications'],
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
            
            mockUserCollection.aggregate.mockResolvedValue(dcpWithMultipleCommons);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(dcpWithMultipleCommons);
            expect(result[0].role).toBe(USER.ROLES.DATA_COMMONS_PERSONNEL);
            expect(result[0].userStatus).toBe(USER.STATUSES.ACTIVE);
            expect(result[0].dataCommons).toContain('commons-1');
            expect(result[0].dataCommons).toContain('commons-2');
            expect(result[0].dataCommons).toHaveLength(3);
        });
    });

    describe('comparison with other user retrieval methods', () => {
        it('should use different query structure than getAdmin', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            await userService.getDCPs(dataCommons);

            // Assert
            const expectedQuery = {
                "userStatus": USER.STATUSES.ACTIVE,
                "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                "dataCommons": { $in: dataCommons }
            };
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{ "$match": expectedQuery }]);
            
            // Verify it's different from getAdmin query
            expect(expectedQuery.role).toBe(USER.ROLES.DATA_COMMONS_PERSONNEL);
            expect(expectedQuery.role).not.toBe(USER.ROLES.ADMIN);
            expect(expectedQuery).toHaveProperty('dataCommons');
        });

        it('should return array format consistent with other user retrieval methods', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('_id');
            expect(result[0]).toHaveProperty('role');
            expect(result[0]).toHaveProperty('userStatus');
            expect(result[0]).toHaveProperty('dataCommons');
        });
    });

    describe('DCP-specific functionality', () => {
        it('should specifically target DCP users', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(result.every(user => 
                user.role === USER.ROLES.DATA_COMMONS_PERSONNEL &&
                user.userStatus === USER.STATUSES.ACTIVE
            )).toBe(true);
        });

        it('should filter by dataCommons correctly', async () => {
            // Arrange
            const dataCommons = ['commons-1'];
            
            mockUserCollection.aggregate.mockResolvedValue([mockDCPs[0]]);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual([mockDCPs[0]]);
            expect(result.every(user => 
                user.dataCommons.includes('commons-1')
            )).toBe(true);
        });

        it('should return all DCPs when "All" is specified', async () => {
            // Arrange
            const dataCommons = ['All'];
            
            mockUserCollection.aggregate.mockResolvedValue(mockDCPs);

            // Act
            const result = await userService.getDCPs(dataCommons);

            // Assert
            expect(result).toEqual(mockDCPs);
            expect(result.every(user => 
                user.role === USER.ROLES.DATA_COMMONS_PERSONNEL &&
                user.userStatus === USER.STATUSES.ACTIVE
            )).toBe(true);
            // Should not filter by specific dataCommons when "All" is specified
            expect(result.some(user => user.dataCommons.includes('commons-1'))).toBe(true);
            expect(result.some(user => user.dataCommons.includes('commons-2'))).toBe(true);
        });
    });
}); 