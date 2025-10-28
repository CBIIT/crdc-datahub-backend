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

    describe('parameter validation', () => {
        it('should throw error when aSubmission is null', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
            };
            const prevSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
            };
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Act & Assert
            await expect(
                submissionService._notifyConfigurationChange(
                    null, // aSubmission is null
                    'v2.0',
                    prevSubmitter,
                    newSubmitter
                )
            ).rejects.toThrow('Failed to notify the configuration update');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('aSubmission parameter is required and cannot be null or undefined')
            );
            consoleErrorSpy.mockRestore();
        });

        it('should throw error when newSubmitter is null', async () => {
            // Arrange
            const prevSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
            };
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Act & Assert
            await expect(
                submissionService._notifyConfigurationChange(
                    mockSubmission,
                    'v2.0',
                    prevSubmitter,
                    null // newSubmitter is null
                )
            ).rejects.toThrow('Failed to notify the configuration update');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('newSubmitter parameter is required and cannot be null or undefined')
            );
            consoleErrorSpy.mockRestore();
        });

        it('should throw error when prevSubmitter is null', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
            };
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Act & Assert
            await expect(
                submissionService._notifyConfigurationChange(
                    mockSubmission,
                    'v2.0',
                    null, // prevSubmitter is null
                    newSubmitter
                )
            ).rejects.toThrow('Failed to notify the configuration update');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('prevSubmitter parameter is required and cannot be null or undefined')
            );
            consoleErrorSpy.mockRestore();
        });

        it('should handle null newModelVersion correctly (isVersionChanged should be false)', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
            };
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                null, // newModelVersion is null
                prevSubmitter,
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
                    studyName: 'Test Study'
                    // Should NOT include prevModelVersion or newModelVersion when isVersionChanged is false
                })
            );

            // Verify that version change fields are not included
            const callArgs = mockNotificationService.updateSubmissionNotification.mock.calls[0][3];
            expect(callArgs).not.toHaveProperty('prevModelVersion');
            expect(callArgs).not.toHaveProperty('newModelVersion');
        });

        it('should handle empty firstName and lastName with "user" fallback', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: '', // Test empty firstName
                lastName: '' // Test empty lastName
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user', // Should fallback to "user" when both names are empty
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: '',
                    lastName: '',
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should log warning when userInfo is null/undefined', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
                // No firstName/lastName properties - will be undefined
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user', // Should fallback to "user" when name is empty
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: undefined,
                    lastName: undefined,
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle null/undefined userInfo in getEmailUserName gracefully with "user" fallback', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: null, // Test null firstName
                lastName: undefined // Test undefined lastName
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user', // Should fallback to "user" when name is empty/whitespace
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: null,
                    lastName: undefined,
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });
    });

    describe('invalid user data scenarios', () => {
        beforeEach(() => {
            // Setup common valid submitter for all invalid data tests
            const validSubmitter = {
                id: 'validUser',
                email: 'valid@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'Valid',
                lastName: 'User'
            };
            mockUserDAO.getUsersByNotifications.mockResolvedValue([]);
        });

        it('should handle userInfo with null firstName and lastName', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: null,
                lastName: null
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user',
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: null,
                    lastName: null,
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle userInfo with undefined firstName and lastName', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION]
                // firstName and lastName are undefined (not set)
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user',
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: undefined,
                    lastName: undefined,
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle userInfo with empty string firstName and lastName', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: '',
                lastName: ''
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user',
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: '',
                    lastName: '',
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle userInfo with whitespace-only firstName and lastName', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: '   ',
                lastName: '\t\n'
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user',
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: '   ',
                    lastName: '\t\n',
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle mixed invalid firstName and lastName values', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: null,
                lastName: ''
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'user',
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'getEmailUserName: formatted name is empty, falling back to "user"',
                expect.objectContaining({
                    firstName: null,
                    lastName: '',
                    userId: 'user2'
                })
            );
            consoleWarnSpy.mockRestore();
        });

        it('should handle userInfo with only firstName (no lastName)', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'ValidFirst',
                lastName: null
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'ValidFirst', // Should work with just firstName
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        it('should handle userInfo with only lastName (no firstName)', async () => {
            // Arrange
            const newSubmitter = {
                id: 'user1',
                email: 'submitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: 'John',
                lastName: 'Doe'
            };
            const prevSubmitter = {
                id: 'user2',
                email: 'oldsubmitter@test.com',
                notifications: [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
                firstName: '',
                lastName: 'ValidLast'
            };
            mockUserDAO.findByIdAndStatus.mockResolvedValue(prevSubmitter);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Act
            await submissionService._notifyConfigurationChange(
                mockSubmission,
                'v2.0',
                prevSubmitter,
                newSubmitter
            );

            // Assert
            expect(mockNotificationService.updateSubmissionNotification).toHaveBeenCalledWith(
                ['submitter@test.com'],
                ['oldsubmitter@test.com'],
                [],
                expect.objectContaining({
                    prevSubmitterName: 'ValidLast', // Should work with just lastName
                    newSubmitterName: 'John Doe'
                })
            );
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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
                { id: 'user1', email: 'submitter@test.com', notifications: [] }, // prevSubmitter
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