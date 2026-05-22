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
    inactiveNewApplicationDays: 30,
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
            mockApplicationDAO.getInactiveApplication
                .mockRejectedValueOnce(new Error('Database connection failed'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            try {
                await expect(applicationService.deleteInactiveApplications()).rejects.toThrow('Database connection failed');
                expect(consoleSpy).toHaveBeenCalledWith('Error in deleteInactiveApplications task:', expect.any(Error));
            } finally {
                consoleSpy.mockRestore();
            }
        });

        test('should handle no inactive applications gracefully', async () => {
            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce([]) // default window
                .mockResolvedValueOnce([]); // short window

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
            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce(undefined) // default window
                .mockResolvedValueOnce(undefined); // short window

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
                    status: 'In Progress',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce(mockApplications) // default window
                .mockResolvedValueOnce([]); // short window
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
                    status: 'In Progress',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                },
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    studyAbbreviation: 'TEST-STUDY-2',
                    status: 'In Progress',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce(mockApplications) // default window
                .mockResolvedValueOnce([]); // short window
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
                    status: 'In Progress',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                },
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    studyAbbreviation: 'TEST-STUDY-2',
                    status: 'In Progress',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce(mockApplications) // default window
                .mockResolvedValueOnce([]); // short window
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

        test('inactiveApplicationsNotification receives studyName and study NA for blank New SRF', async () => {
            const mockShortApps = [
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    questionnaireData: '{}',
                    studyAbbreviation: undefined,
                    studyName: undefined,
                    programName: undefined,
                    status: 'New',
                    ORCID: undefined,
                    PI: undefined,
                    programAbbreviation: undefined,
                    programDescription: undefined,
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce([]) // default window
                .mockResolvedValueOnce(mockShortApps); // short window
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.aggregate.mockResolvedValue([
                { _id: 'user2', notifications: ['submission_request:deleted'] }
            ]);
            mockApplicationDAO.delete.mockResolvedValue({});

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                expect(mockNotificationsService.inactiveApplicationsNotification).toHaveBeenCalledWith(
                    'user2@test.com',
                    [],
                    [],
                    expect.objectContaining({
                        firstName: 'User 2',
                        studyName: 'NA'
                    }),
                    expect.objectContaining({
                        study: 'NA',
                        inactiveDays: 30,
                        url: 'http://test.com'
                    })
                );
            } finally {
                consoleSpy.mockRestore();
            }
        });

        test('should detect and permanently delete blank New SRFs', async () => {
            const mockDefaultApps = [
                {
                    _id: 'app1',
                    applicantID: 'user1',
                    applicant: { applicantEmail: 'user1@test.com', applicantName: 'User 1' },
                    studyAbbreviation: 'TEST-STUDY',
                    status: 'In Progress',
                    programName: 'Program1',
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            const mockShortApps = [
                {
                    _id: 'app2',
                    applicantID: 'user2',
                    applicant: { applicantEmail: 'user2@test.com', applicantName: 'User 2' },
                    studyAbbreviation: undefined,
                    studyName: undefined,
                    programName: undefined,
                    status: 'New',
                    ORCID: undefined,
                    PI: undefined,
                    programAbbreviation: undefined,
                    programDescription: undefined,
                    history: [],
                    updatedAt: new Date('2023-01-01')
                }
            ];

            mockApplicationDAO.getInactiveApplication
                .mockResolvedValueOnce(mockDefaultApps) // default window
                .mockResolvedValueOnce(mockShortApps); // short window
            mockUserService.getUsersByNotifications.mockResolvedValue([]);
            mockUserService.userCollection.aggregate.mockResolvedValue([]);
            mockApplicationDAO.update.mockResolvedValue({});
            mockApplicationDAO.delete.mockResolvedValue({});

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await applicationService.deleteInactiveApplications();

                // Should have 2 apps total (one from default, one blank from short)
                expect(consoleSpy).toHaveBeenCalledWith('Found 2 inactive applications to process');
                // delete should be called for blank New SRF
                expect(mockApplicationDAO.delete).toHaveBeenCalledWith('app2');
                // update should be called for the default app
                expect(mockApplicationDAO.update).toHaveBeenCalled();
            } finally {
                consoleSpy.mockRestore();
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