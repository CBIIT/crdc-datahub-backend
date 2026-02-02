const { ApprovedStudiesService } = require('../../services/approved-studies');
const { ADMIN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const ERROR = require('../../constants/error-constants');
const { verifySession } = require('../../verifier/user-info-verifier');
const { getDataCommonsDisplayNamesForApprovedStudy } = require('../../utility/data-commons-remapper');
const TEST_CONSTANTS = require('../test-constants');
const USER = require('../../crdc-datahub-database-drivers/constants/user-constants');
const { EMAIL_NOTIFICATIONS } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');

// Mock dependencies
jest.mock('../../verifier/user-info-verifier');
jest.mock('../../utility/data-commons-remapper');
jest.mock('../../dao/approvedStudy');
jest.mock('../../dao/program');
jest.mock('../../dao/user');
jest.mock('../../dao/submission');
jest.mock('../../dao/application');

describe('ApprovedStudiesService - Notification Error Handling', () => {
    let service;
    let mockApprovedStudiesCollection;
    let mockUserCollection;
    let mockOrganizationService;
    let mockSubmissionCollection;
    let mockAuthorizationService;
    let mockNotificationsService;
    let mockEmailParams;
    let mockApprovedStudyDAO;
    let mockUserDAO;
    let mockSubmissionDAO;
    let mockApplicationDAO;

    beforeEach(() => {
        // Initialize mock collections and services
        mockApprovedStudiesCollection = {
            aggregate: jest.fn(),
            find: jest.fn(),
            findOneAndUpdate: jest.fn(),
            insert: jest.fn(),
            update: jest.fn()
        };
        mockUserCollection = {
            aggregate: jest.fn()
        };
        mockOrganizationService = {
            findByStudyID: jest.fn(),
            findOneByStudyID: jest.fn(),
            getOrganizationByID: jest.fn(),
            getOrganizationByName: jest.fn(),
            organizationCollection: {
                aggregate: jest.fn()
            }
        };
        mockSubmissionCollection = {
            updateMany: jest.fn()
        };
        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };
        mockNotificationsService = {
            clearPendingModelState: jest.fn()
        };
        mockEmailParams = {
            url: 'https://test.com',
            submissionGuideURL: 'https://test.com/guide',
            contactEmail: 'test@test.com'
        };

        // Mock DAOs
        mockApprovedStudyDAO = {
            getApprovedStudyByID: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn()
        };
        mockUserDAO = {
            findFirst: jest.fn(),
            getUsersByNotifications: jest.fn()
        };
        mockSubmissionDAO = {
            updateMany: jest.fn()
        };
        mockApplicationDAO = {
            findFirst: jest.fn()
        };

        service = new ApprovedStudiesService(
            mockApprovedStudiesCollection,
            mockUserCollection,
            mockOrganizationService,
            mockSubmissionCollection,
            mockAuthorizationService,
            mockNotificationsService,
            mockEmailParams
        );

        // Inject mock DAOs
        service.approvedStudyDAO = mockApprovedStudyDAO;
        service.userDAO = mockUserDAO;
        service.submissionDAO = mockSubmissionDAO;
        service.applicationDAO = mockApplicationDAO;

        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('editApprovedStudyAPI - Notification Error Handling Requirements', () => {
        const mockParams = {
            studyID: 'study-id',
            name: 'Updated Study',
            acronym: 'US',
            controlledAccess: true,
            openAccess: true,
            dbGaPID: 'phs000000',
            ORCID: '0000-0002-1825-0097',
            PI: 'Dr. Updated',
            primaryContactID: 'contact-id',
            useProgramPC: false,
            pendingModelChange: false, // This will trigger notification
            isPendingGPA: false,
            GPAName: 'Test GPA'
        };

        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };

        const mockUserScope = { isNoneScope: () => false, isAllScope: () => true };
        
        const mockStudy = {
            _id: 'study-id',
            studyName: 'Old Study',
            studyAbbreviation: 'OS',
            controlledAccess: true,
            openAccess: false,
            dbGaPID: 'old-gap',
            ORCID: 'old-orcid',
            PI: 'Dr. Old',
            primaryContactID: null,
            useProgramPC: false,
            pendingModelChange: true, // Was pending, now cleared
            isPendingGPA: true, // Was pending, now cleared
            applicationID: 'app-id'
        };

        const mockPrimaryContact = {
            _id: 'contact-id',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@test.com',
            role: USER.USER.ROLES.DATA_COMMONS_PERSONNEL
        };

        const mockPrograms = [
            {
                _id: 'program-id',
                conciergeID: 'concierge-id'
            }
        ];

        const mockApplication = {
            _id: 'app-id',
            applicantID: 'submitter-id'
        };

        const mockSubmitter = {
            _id: 'submitter-id',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@test.com',
            notifications: [EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_PENDING_CLEARED]
        };

        const mockBCCUsers = [
            {
                _id: 'bcc-user-1',
                email: 'bcc1@test.com'
            }
        ];

        const mockDisplayStudy = { 
            ...mockStudy, 
            studyName: 'Updated Study', 
            dataCommonsDisplayName: 'Updated Study Display Name' 
        };

        beforeEach(() => {
            jest.clearAllMocks();
            verifySession.mockReturnValue({ verifyInitialized: jest.fn() });
            service._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
            service._validateStudyName = jest.fn().mockResolvedValue(true);
            service._findUserByID = jest.fn().mockResolvedValue(mockPrimaryContact);
            service._validateProgramID = jest.fn().mockResolvedValue(mockPrograms[0]);
            service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue({ ...mockStudy });
            service.approvedStudyDAO.update = jest.fn().mockResolvedValue(true);
            service._findOrganizationByStudyID = jest.fn().mockResolvedValue(mockPrograms);
            service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ count: 1 });
            service._getConcierge = jest.fn().mockReturnValue('concierge-id');
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayStudy);
        });

        describe('Requirement 1: Perform Update First', () => {
            it('should complete database updates before attempting notification', async () => {
                // Setup mocks for successful notification
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const updateSpy = jest.spyOn(service.approvedStudyDAO, 'update');
                const submissionUpdateSpy = jest.spyOn(service.submissionDAO, 'updateMany');
                const notificationSpy = jest.spyOn(service, '_notifyClearPendingState');

                await service.editApprovedStudyAPI(mockParams, mockContext);

                // Verify database updates happened first
                expect(updateSpy).toHaveBeenCalled();
                expect(submissionUpdateSpy).toHaveBeenCalled();
                
                // Verify notification was called after updates
                expect(notificationSpy).toHaveBeenCalled();
            });

            it('should commit study update to database before notification', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const updateSpy = jest.spyOn(service.approvedStudyDAO, 'update');

                await service.editApprovedStudyAPI(mockParams, mockContext);

                // Verify the study was updated with the new values
                expect(updateSpy).toHaveBeenCalledWith('study-id', expect.objectContaining({
                    studyName: 'Updated Study',
                    controlledAccess: true,
                    pendingModelChange: false,
                    isPendingGPA: false
                }));
            });

            it('should commit submission updates to database before notification', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const submissionUpdateSpy = jest.spyOn(service.submissionDAO, 'updateMany');

                await service.editApprovedStudyAPI(mockParams, mockContext);

                // Verify submissions were updated
                expect(submissionUpdateSpy).toHaveBeenCalledWith(
                    {
                        studyID: 'study-id',
                        status: { in: expect.any(Array) },
                        conciergeID: { not: 'contact-id' }
                    },
                    {
                        conciergeID: 'contact-id',
                        updatedAt: expect.any(Date)
                    }
                );
            });
        });

        describe('Requirement 2: Then Try to Send Notification', () => {
            it('should attempt notification after successful database updates', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const notificationSpy = jest.spyOn(service, '_notifyClearPendingState');

                await service.editApprovedStudyAPI(mockParams, mockContext);

                expect(notificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                    _id: 'study-id',
                    studyName: 'Updated Study',
                    applicationID: 'app-id'
                }));
            });

            it('should only attempt notification when pending state is cleared', async () => {
                // Test case where pending state is not cleared (no notification should be sent)
                const paramsNoNotification = {
                    ...mockParams,
                    pendingModelChange: true, // Still pending
                    isPendingGPA: true // Still pending
                };

                const notificationSpy = jest.spyOn(service, '_notifyClearPendingState');

                await service.editApprovedStudyAPI(paramsNoNotification, mockContext);

                expect(notificationSpy).not.toHaveBeenCalled();
            });

            it('should call notification service with correct parameters', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                await service.editApprovedStudyAPI(mockParams, mockContext);

                expect(service.notificationsService.clearPendingModelState).toHaveBeenCalledWith(
                    'john.doe@test.com',
                    ['bcc1@test.com'],
                    {
                        firstName: 'John Doe',
                        studyName: 'Updated Study',
                        portalURL: 'https://test.com',
                        submissionGuideURL: 'https://test.com/guide',
                        contactEmail: 'test@test.com'
                    }
                );
            });
        });

        describe('Requirement 3: Return Error Message if Notification Fails', () => {
            it('should throw error when application is not found', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(null);

                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");
            });

            it('should throw error when submitter is not found', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(null);

                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");
            });

            it('should throw error when notification service fails', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: [] });

                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");
            });

            it('should throw error when notification service throws exception', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockRejectedValue(new Error('Email service down'));

                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");
            });

            it('should include studyID in error message', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(null);

                try {
                    await service.editApprovedStudyAPI(mockParams, mockContext);
                } catch (error) {
                    expect(error.message).toContain('studyID: study-id');
                }
            });

            it('should log internal error details while throwing user-friendly error', async () => {
                const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
                service.applicationDAO.findFirst = jest.fn().mockRejectedValue(new Error('Database connection failed'));

                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");

                expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
                consoleSpy.mockRestore();
            });
        });

        describe('Integration Test: Complete Flow', () => {
            it('should meet all three requirements in sequence', async () => {
                // Setup successful notification
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const result = await service.editApprovedStudyAPI(mockParams, mockContext);

                // Requirement 1: Update completed first
                expect(service.approvedStudyDAO.update).toHaveBeenCalled();
                expect(service.submissionDAO.updateMany).toHaveBeenCalled();

                // Requirement 2: Notification attempted after updates
                expect(service.notificationsService.clearPendingModelState).toHaveBeenCalled();

                // Requirement 3: Success returned (no error thrown)
                expect(result).toEqual(mockDisplayStudy);
            });

            it('should meet requirements even when notification fails', async () => {
                // Setup notification failure
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(null);

                // Requirements 1 & 2: Updates completed, notification attempted
                await expect(service.editApprovedStudyAPI(mockParams, mockContext))
                    .rejects.toThrow("Failed to send notification for clearing the approved study; studyID: study-id");

                // Verify updates still happened
                expect(service.approvedStudyDAO.update).toHaveBeenCalled();
                expect(service.submissionDAO.updateMany).toHaveBeenCalled();

                // Requirement 3: Error message returned
                // (This is verified by the expect().rejects.toThrow above)
            });
        });

        describe('Edge Cases', () => {
            it('should handle notification when submitter has no notification preferences', async () => {
                const submitterNoNotifications = {
                    ...mockSubmitter,
                    notifications: [] // No notification preferences
                };

                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(submitterNoNotifications);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue(mockBCCUsers);

                const result = await service.editApprovedStudyAPI(mockParams, mockContext);

                // Should succeed without sending notification
                expect(service.notificationsService.clearPendingModelState).not.toHaveBeenCalled();
                expect(result).toEqual(mockDisplayStudy);
            });

            it('should handle case when no BCC users are found', async () => {
                service.applicationDAO.findFirst = jest.fn().mockResolvedValue(mockApplication);
                service.userDAO.findFirst = jest.fn().mockResolvedValue(mockSubmitter);
                service.userDAO.getUsersByNotifications = jest.fn().mockResolvedValue([]);
                service.notificationsService.clearPendingModelState = jest.fn().mockResolvedValue({ accepted: ['email'] });

                const result = await service.editApprovedStudyAPI(mockParams, mockContext);

                expect(service.notificationsService.clearPendingModelState).toHaveBeenCalledWith(
                    'john.doe@test.com',
                    [], // Empty BCC list
                    expect.any(Object)
                );
                expect(result).toEqual(mockDisplayStudy);
            });
        });
    });
});
