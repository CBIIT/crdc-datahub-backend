const { UserService } = require('../../services/user');
const UserDAO = require('../../dao/user');
const ApprovedStudyDAO = require('../../dao/approvedStudy');

// Mock dependencies
jest.mock('../../dao/user');
jest.mock('../../dao/approvedStudy');

describe('UserService.getUsersByIDs', () => {
    let userService;
    let mockUserDAO;
    let mockApprovedStudyDAO;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create mock instances
        mockUserDAO = {
            findManyByIds: jest.fn()
        };

        mockApprovedStudyDAO = {
            findMany: jest.fn()
        };

        // Create UserService instance with mocked dependencies
        userService = new UserService(
            mockUserDAO, // userCollection
            {}, // logCollection
            {}, // organizationCollection
            {}, // notificationsService
            {}, // submissionsCollection
            {}, // applicationCollection
            '', // officialEmail
            '', // appUrl
            { approvedStudiesCollection: mockApprovedStudyDAO }, // approvedStudiesService
            60, // inactiveUserDays
            {}, // configurationService
            {}, // institutionService
            {} // authorizationService
        );

        // Replace the userDAO instance with our mock
        userService.userDAO = mockUserDAO;
        userService.approvedStudyDAO = mockApprovedStudyDAO;
    });

    describe('getUsersByIDs', () => {
        it('should return empty array when no userIDs provided', async () => {
            const result = await userService.getUsersByIDs([]);
            expect(result).toEqual([]);
            expect(mockUserDAO.findManyByIds).not.toHaveBeenCalled();
        });

        it('should return empty array when userIDs is null', async () => {
            const result = await userService.getUsersByIDs(null);
            expect(result).toEqual([]);
            expect(mockUserDAO.findManyByIds).not.toHaveBeenCalled();
        });

        it('should return empty array when userIDs is undefined', async () => {
            const result = await userService.getUsersByIDs(undefined);
            expect(result).toEqual([]);
            expect(mockUserDAO.findManyByIds).not.toHaveBeenCalled();
        });

        it('should fetch multiple users and populate studies in parallel', async () => {
            const userIDs = ['user1', 'user2', 'user3'];
            const mockUsers = [
                { _id: 'user1', firstName: 'John', lastName: 'Doe', studies: ['study1', 'study2'] },
                { _id: 'user2', firstName: 'Jane', lastName: 'Smith', studies: ['study3'] },
                { _id: 'user3', firstName: 'Bob', lastName: 'Johnson', studies: [] }
            ];

            const mockStudies = [
                { _id: 'study1', studyName: 'Study 1' },
                { _id: 'study2', studyName: 'Study 2' },
                { _id: 'study3', studyName: 'Study 3' }
            ];

            // Mock the DAO calls
            mockUserDAO.findManyByIds.mockResolvedValue(mockUsers);
            mockApprovedStudyDAO.findMany.mockResolvedValue(mockStudies);

            const result = await userService.getUsersByIDs(userIDs);

            // Verify the DAO was called correctly
            expect(mockUserDAO.findManyByIds).toHaveBeenCalledWith(userIDs);
            // Each user with studies will call findMany once
            expect(mockApprovedStudyDAO.findMany).toHaveBeenCalledTimes(2);

            // Verify the result structure
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({
                _id: 'user1',
                firstName: 'John',
                lastName: 'Doe',
                studies: mockStudies
            });
            expect(result[1]).toEqual({
                _id: 'user2',
                firstName: 'Jane',
                lastName: 'Smith',
                studies: mockStudies
            });
            expect(result[2]).toEqual({
                _id: 'user3',
                firstName: 'Bob',
                lastName: 'Johnson',
                studies: []
            });
        });

        it('should handle users with "All" studies', async () => {
            const userIDs = ['user1'];
            const mockUsers = [
                { _id: 'user1', firstName: 'John', lastName: 'Doe', studies: ['All'] }
            ];

            mockUserDAO.findManyByIds.mockResolvedValue(mockUsers);

            const result = await userService.getUsersByIDs(userIDs);

            expect(result).toHaveLength(1);
            expect(result[0].studies).toEqual([{ _id: 'All', studyName: 'All' }]);
            expect(mockApprovedStudyDAO.findMany).not.toHaveBeenCalled();
        });

        it('should handle users with mixed study formats', async () => {
            const userIDs = ['user1'];
            const mockUsers = [
                { _id: 'user1', firstName: 'John', lastName: 'Doe', studies: ['study1', { _id: 'study2' }] }
            ];

            mockUserDAO.findManyByIds.mockResolvedValue(mockUsers);
            mockApprovedStudyDAO.findMany.mockResolvedValue([
                { _id: 'study1', studyName: 'Study 1' },
                { _id: 'study2', studyName: 'Study 2' }
            ]);

            const result = await userService.getUsersByIDs(userIDs);

            expect(result).toHaveLength(1);
            expect(mockApprovedStudyDAO.findMany).toHaveBeenCalledWith({
                id: { in: ['study1', 'study2'] }
            });
        });

        it('should handle database errors gracefully', async () => {
            const userIDs = ['user1'];
            const dbError = new Error('Database connection failed');

            mockUserDAO.findManyByIds.mockRejectedValue(dbError);

            await expect(userService.getUsersByIDs(userIDs)).rejects.toThrow('Database connection failed');
            expect(mockUserDAO.findManyByIds).toHaveBeenCalledWith(userIDs);
        });

        it('should handle users with null/undefined studies gracefully', async () => {
            const userIDs = ['user1'];
            const mockUsers = [
                { _id: 'user1', firstName: 'John', lastName: 'Doe', studies: ['study1', null, undefined, { _id: 'study2' }] }
            ];

            mockUserDAO.findManyByIds.mockResolvedValue(mockUsers);
            mockApprovedStudyDAO.findMany.mockResolvedValue([
                { _id: 'study1', studyName: 'Study 1' },
                { _id: 'study2', studyName: 'Study 2' }
            ]);

            const result = await userService.getUsersByIDs(userIDs);

            expect(result).toHaveLength(1);
            // Should only call findMany with valid study IDs (null/undefined filtered out)
            expect(mockApprovedStudyDAO.findMany).toHaveBeenCalledWith({
                id: { in: ['study1', 'study2'] }
            });
        });

        it('should handle studies fetch errors gracefully', async () => {
            const userIDs = ['user1'];
            const mockUsers = [
                { _id: 'user1', firstName: 'John', lastName: 'Doe', studies: ['study1'] }
            ];

            mockUserDAO.findManyByIds.mockResolvedValue(mockUsers);
            mockApprovedStudyDAO.findMany.mockRejectedValue(new Error('Studies fetch failed'));

            await expect(userService.getUsersByIDs(userIDs)).rejects.toThrow('Studies fetch failed');
        });
    });
}); 