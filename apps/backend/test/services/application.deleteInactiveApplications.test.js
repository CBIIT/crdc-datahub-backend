const { Application } = require('../../services/application');

// Mock dependencies
const mockLogCollection = { insert: jest.fn() };
const mockApplicationCollection = { find: jest.fn(), update: jest.fn(), delete: jest.fn() };
const mockApprovedStudiesService = {};
const mockUserService = {
    getUsersByNotifications: jest.fn(),
    userCollection: { 
        find: jest.fn(),
        aggregate: jest.fn()
    }
};
const mockDbService = {};
const mockNotificationsService = {
    inactiveApplicationsNotification: jest.fn()
};
const mockEmailParams = {
    inactiveDays: 180,
    url: 'http://test.com',
    officialEmail: 'test@example.com'
};
const mockOrganizationService = {};
const mockConfigurationService = {};
const mockAuthorizationService = {};

describe('deleteInactiveApplications Error Handling', () => {
    let applicationService;
    let mockApplicationDAO;
    let originalGlobals;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Store original global values to restore later
        originalGlobals = {
            DELETED: global.DELETED,
            EMAIL_NOTIFICATIONS: global.EMAIL_NOTIFICATIONS,
            ROLES: global.ROLES
        };
        
        // Mock constants
        global.DELETED = 'DELETED';
        global.EMAIL_NOTIFICATIONS = {
            SUBMISSION_REQUEST: {
                REQUEST_DELETE: 'REQUEST_DELETE'
            }
        };
        global.ROLES = {
            FEDERAL_LEAD: 'FEDERAL_LEAD',
            DATA_COMMONS_PERSONNEL: 'DATA_COMMONS_PERSONNEL',
            ADMIN: 'ADMIN'
        };
        
        // Create mock DAO
        mockApplicationDAO = {
            getInactiveApplication: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        };
        
        applicationService = new Application(
            mockLogCollection,
            mockApplicationCollection,
            mockApprovedStudiesService,
            mockUserService,
            mockDbService,
            mockNotificationsService,
            mockEmailParams,
            mockOrganizationService,
            null,
            mockConfigurationService,
            null
        );
        
        // Inject mock DAO
        applicationService.applicationDAO = mockApplicationDAO;
    });

    afterEach(() => {
        // Restore original global values
        if (originalGlobals) {
            global.DELETED = originalGlobals.DELETED;
            global.EMAIL_NOTIFICATIONS = originalGlobals.EMAIL_NOTIFICATIONS;
            global.ROLES = originalGlobals.ROLES;
        }
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    afterAll(() => {
        // Final cleanup
        jest.restoreAllMocks();
    });

    describe('Error Handling Improvements', () => {
        test('should handle database query failures with try-catch', async () => {
            mockApplicationDAO.getInactiveApplication.mockRejectedValue(new Error('Database connection failed'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            try {
                await expect(applicationService.deleteInactiveApplications()).rejects.toThrow('Database connection failed');
                expect(consoleSpy).toHaveBeenCalledWith('Error in deleteInactiveApplications task:', expect.any(Error));
            } finally {
                consoleSpy.mockRestore();
            }
        });

        test('should handle no inactive applications gracefully', async () => {
            mockApplicationDAO.getInactiveApplication.mockResolvedValue([]);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                expect(consoleSpy).toHaveBeenCalledWith('No inactive applications found to delete');
                expect(mockApplicationDAO.update).not.toHaveBeenCalled();
            } finally {
                consoleSpy.mockRestore();
            }
        });

        test('should handle undefined applications array gracefully', async () => {
            mockApplicationDAO.getInactiveApplication.mockResolvedValue(undefined);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                expect(consoleSpy).toHaveBeenCalledWith('No inactive applications found to delete');
                expect(mockApplicationDAO.update).not.toHaveBeenCalled();
            } finally {
                consoleSpy.mockRestore();
            }
        });

        test('should log when applications are found', async () => {
            const mockApplications = [
                {
                    _id: 'app1',
                    applicantID: 'user1',
                    applicant: { applicantEmail: 'user1@test.com', applicantName: 'User 1' },
                    studyAbbreviation: 'TEST-STUDY',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication.mockResolvedValue(mockApplications);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.aggregate.mockResolvedValue([]);
            mockApplicationDAO.update.mockResolvedValue({});

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                expect(consoleSpy).toHaveBeenCalledWith('Found 1 inactive applications to process');
            } finally {
                consoleSpy.mockRestore();
            }
        });
    });

    describe('Promise.allSettled Behavior', () => {
        test('should handle partial failures in batch operations', async () => {
            const mockApplications = [
                {
                    _id: 'app1',
                    applicantID: 'user1',
                    applicant: { applicantEmail: 'user1@test.com', applicantName: 'User 1' },
                    studyAbbreviation: 'TEST-STUDY',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                },
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    studyAbbreviation: 'TEST-STUDY-2',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication.mockResolvedValue(mockApplications);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.aggregate.mockResolvedValue([]);
            
            // First update succeeds, second fails
            mockApplicationDAO.update
                .mockResolvedValueOnce({}) // app1 succeeds
                .mockRejectedValueOnce(new Error('Update failed')); // app2 fails

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                // Should log successful processing
                expect(consoleSpy).toHaveBeenCalledWith('Found 2 inactive applications to process');
                expect(consoleSpy).toHaveBeenCalledWith('Successfully processed 1 inactive applications');
                
                // Should log the failure
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update 1 applications:', expect.any(Array));
            } finally {
                consoleSpy.mockRestore();
                consoleErrorSpy.mockRestore();
            }
        });

        test('should only send emails for successfully updated applications', async () => {
            const mockApplications = [
                {
                    _id: 'app1',
                    applicantID: 'user1',
                    applicant: { applicantEmail: 'user1@test.com', applicantName: 'User 1' },
                    studyAbbreviation: 'TEST-STUDY',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                },
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    studyAbbreviation: 'TEST-STUDY-2',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication.mockResolvedValue(mockApplications);
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.aggregate.mockResolvedValue([]);
            
            // First update succeeds, second fails
            mockApplicationDAO.update
                .mockResolvedValueOnce({}) // app1 succeeds
                .mockRejectedValueOnce(new Error('Update failed')); // app2 fails

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                // Should log successful processing
                expect(consoleSpy).toHaveBeenCalledWith('Found 2 inactive applications to process');
                expect(consoleSpy).toHaveBeenCalledWith('Successfully processed 1 inactive applications');
                
                // Should log the failure
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update 1 applications:', expect.any(Array));
                
                // Verify that only 1 email notification was attempted (for the successful update)
                expect(consoleSpy).toHaveBeenCalledWith('Sent 1 email notifications for inactive applications');
            } finally {
                consoleSpy.mockRestore();
                consoleErrorSpy.mockRestore();
            }
        });
    });

    describe('Method Structure Validation', () => {
        test('should have try-catch wrapper', () => {
            const methodString = applicationService.deleteInactiveApplications.toString();
            expect(methodString).toContain('try {');
            expect(methodString).toContain('} catch (error) {');
        });

        test('should use Promise.allSettled for batch operations', () => {
            const methodString = applicationService.deleteInactiveApplications.toString();
            expect(methodString).toContain('Promise.allSettled');
        });

        test('should log error and re-throw', () => {
            const methodString = applicationService.deleteInactiveApplications.toString();
            expect(methodString).toContain('console.error');
            expect(methodString).toContain('throw error');
        });
    });
});