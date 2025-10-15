const { Submission } = require('../../services/submission');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const { EMAIL_NOTIFICATIONS: EN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');

describe('Submission._notifyConfigurationChange', () => {
    let submissionService;
    let mockUserDAO;
    let mockNotificationService;
    let mockSubmission;

    beforeEach(() => {
        // Mock dependencies
        mockUserDAO = {
            getUsersByNotifications: jest.fn(),
            findByIdAndStatus: jest.fn()
        };
        mockNotificationService = {
            updateSubmissionNotification: jest.fn().mockResolvedValue({ accepted: ['test@example.com'] })
        };

        // Create submission service with mocked dependencies
        submissionService = new Submission(
            null, // logCollection
            null, // submissionCollection
            null, // batchService
            null, // userService
            { organizationCollection: null }, // organizationService
            mockNotificationService, // notificationService
            null, // dataRecordService
            null, // fetchDataModelInfo
            null, // awsService
            null, // metadataQueueName
            null, // s3Service
            { url: 'https://test.com' }, // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            null, // validationCollection
            null, // sqsLoaderQueue
            null, // qcResultsService
            null, // uploaderCLIConfigs
            null, // submissionBucketName
            null, // configurationService
            null, // uploadingMonitor
            null, // dataCommonsBucketMap
            null, // authorizationService
            null, // dataModelService
            null  // dataRecordsCollection
        );

        submissionService.userDAO = mockUserDAO;

        // Mock submission data
        mockSubmission = {
            id: 'sub1',
            _id: 'sub1',
            dataCommons: 'commonsA',
            studyID: 'study123',
            modelVersion: 'v1.0',
            study: { studyName: 'Test Study' }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('submitter validation', () => {
        it('should return early when newSubmitter has no notification enabled', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [] // No notifications enabled
            };
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                `Submission updated; submitter does not have configuration change notifications enabled. submissionID: sub1, submitterID: user1`
            );
            expect(mockNotificationService.updateSubmissionNotification).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        it('should proceed when newSubmitter has notification enabled', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalled();
        });
    });

    describe('CC logic for submitter changes', () => {
        it('should CC old submitter when submitter changes and old submitter has notification', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user2',
                email: 'newsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'New',
                lastName: 'Submitter'
            };
            const prevSubmitter = {
                id: 'user1',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                role: USER.ROLES.SUBMITTER,
                firstName: 'Old',
                lastName: 'Submitter'
            };

            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['newsubmitter@test.com'], // submitterEmails
                ['oldsubmitter@test.com'], // CCEmails
                [], // BCCEmails
                expect.any(Object) // templateParams
            );
        });

        it('should not CC old submitter when they have no notification enabled', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user2',
                email: 'newsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'New',
                lastName: 'Submitter'
            };
            const prevSubmitter = {
                id: 'user1',
                email: 'oldsubmitter@test.com',
                notifications: [], // No notifications
                role: USER.ROLES.SUBMITTER,
                firstName: 'Old',
                lastName: 'Submitter'
            };

            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['newsubmitter@test.com'], // submitterEmails
                [], // CCEmails (empty - no CC)
                [], // BCCEmails
                expect.any(Object) // templateParams
            );
        });
    });

    describe('BCC recipient filtering', () => {
        beforeEach(() => {
            // Setup common submitter for all BCC tests
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);
        });

        it('should include Data Commons Personnel only for matching data commons', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const dcpMatching = {
                id: 'dcp1',
                email: 'dcp1@test.com',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                dataCommons: ['commonsA', 'commonsB']
            };
            const dcpNonMatching = {
                id: 'dcp2',
                email: 'dcp2@test.com',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                dataCommons: ['commonsC']
            };

            mockUserDAO.getUsersByNotifications.mockResolvedValue([dcpMatching, dcpNonMatching]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                [],
                ['dcp1@test.com'], // Only matching DCP included
                expect.any(Object)
            );
        });

        it('should include Federal Leads only for matching study', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const fedLeadMatching = {
                id: 'fed1',
                email: 'fed1@test.com',
                role: USER.ROLES.FEDERAL_LEAD,
                studies: [{ id: 'study123' }, { id: 'study456' }]
            };
            const fedLeadNonMatching = {
                id: 'fed2',
                email: 'fed2@test.com',
                role: USER.ROLES.FEDERAL_LEAD,
                studies: [{ id: 'study789' }]
            };

            mockUserDAO.getUsersByNotifications.mockResolvedValue([fedLeadMatching, fedLeadNonMatching]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                [],
                ['fed1@test.com'], // Only matching Federal Lead included
                expect.any(Object)
            );
        });

        it('should always include Admins', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const admin = {
                id: 'admin1',
                email: 'admin@test.com',
                role: USER.ROLES.ADMIN
            };

            mockUserDAO.getUsersByNotifications.mockResolvedValue([admin]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                [],
                ['admin@test.com'], // Admin always included
                expect.any(Object)
            );
        });
    });

    describe('email sending', () => {
        it('should send notification with correct recipients and template params', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                null,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                [],
                [],
                expect.objectContaining({
                    firstName: 'John Doe',
                    portalURL: 'https://test.com',
                    studyName: 'Test Study',
                    newModelVersion: 'v2.0',
                    prevModelVersion: 'v1.0'
                })
            );
        });

        it('should include submitter change information when submitter changes', async () => {
            // Arrange
            const prevSubmitter = {
                id: 'user1',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                role: USER.ROLES.SUBMITTER,
                firstName: 'Old',
                lastName: 'Submitter'
            };
            const newSubmitter = {
                id: 'user2',
                email: 'newsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'New',
                lastName: 'Submitter'
            };

            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['newsubmitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'Old Submitter',
                    newSubmitterName: 'New Submitter'
                })
            );
        });
    });
});