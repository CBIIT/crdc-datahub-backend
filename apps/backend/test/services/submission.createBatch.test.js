const { Submission } = require('../../services/submission');
const { NEW, IN_PROGRESS, WITHDRAWN, REJECTED } = require('../../constants/submission-constants');
const ERROR = require('../../constants/error-constants');
const { HistoryEventBuilder } = require('../../domain/history-event');
const { getCurrentTime } = require('../../crdc-datahub-database-drivers/utility/time-utility');

// Mock dependencies
jest.mock('../../dao/submission');
jest.mock('../../dao/batch');
jest.mock('../../services/batch-service');
jest.mock('../../services/user');
jest.mock('../../services/authorization-service');
jest.mock('../../domain/history-event');
jest.mock('../../domain/user-scope');
jest.mock('../../crdc-datahub-database-drivers/utility/time-utility');

const SubmissionDAO = require('../../dao/submission');

describe('Submission Service - createBatch with Status Change to In Progress', () => {
    let submissionService;
    let mockSubmissionDAO;
    let mockBatchService;
    let mockAuthorizationService;
    let mockContext;
    let mockUserScope;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock getCurrentTime
        getCurrentTime.mockReturnValue('2024-01-15T10:00:00.000Z');

        // Mock HistoryEventBuilder
        HistoryEventBuilder.createEvent = jest.fn((userID, status, comment) => ({
            userID,
            status,
            reviewComment: comment,
            dateTime: getCurrentTime()
        }));

        // Create mock DAO
        mockSubmissionDAO = new SubmissionDAO();
        mockSubmissionDAO.findByID = jest.fn();
        mockSubmissionDAO.update = jest.fn();

        // Create mock batch service - just use plain object since it's mocked
        mockBatchService = {
            createBatch: jest.fn()
        };

        // Create mock authorization service - just use plain object since it's mocked
        mockAuthorizationService = {
            getUserRole: jest.fn().mockResolvedValue('Admin')
        };

        // Create mock user scope
        mockUserScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
            isAllScope: jest.fn().mockReturnValue(false),
            isOwnScope: jest.fn().mockReturnValue(true),
            hasAccessToSubmission: jest.fn().mockReturnValue(true)
        };

        // Create mock organization service
        const mockOrganizationService = {
            organizationCollection: {}
        };

        // Create submission service instance
        submissionService = new Submission(
            null, // logCollection
            null, // submissionCollection
            mockSubmissionDAO,
            null, // programDAO
            mockOrganizationService, // organizationService
            null, // userService
            null, // dataRecordService
            mockBatchService,
            null, // userInitializationService
            null, // notifyUser
            null, // s3Service
            null, // awsService
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            null, // qcResultService
            null, // approvedStudyDAO
            null, // validationDAO
            null, // pendingPVDAO
            'test-bucket', // submissionBucketName
            null, // configService
            null, // monitor
            {}, // bucketMap
            mockAuthorizationService,
            null, // dataModelService
            null // submissionMongoCollection
        );
        
        // Override submissionDAO and batchService with our mocks after construction
        submissionService.submissionDAO = mockSubmissionDAO;
        submissionService.batchService = mockBatchService;

        // Mock _getUserScope
        submissionService._getUserScope = jest.fn().mockResolvedValue(mockUserScope);

        // Mock _verifyBatchPermission
        submissionService._verifyBatchPermission = jest.fn();
        
        // Mock _findByID to return the submission from findByID
        submissionService._findByID = jest.fn().mockImplementation((id) => {
            return mockSubmissionDAO.findByID(id);
        });

        // Create mock context
        mockContext = {
            userInfo: {
                _id: 'user-123',
                email: 'test@example.com',
                role: 'Submitter'
            }
        };
    });

    describe('Status transition from NEW to IN_PROGRESS', () => {
        it('should record history when status changes from NEW to IN_PROGRESS', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-123',
                name: 'Test Submission',
                status: NEW,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [
                    {
                        userID: 'user-123',
                        status: NEW,
                        dateTime: '2024-01-15T09:00:00.000Z'
                    }
                ],
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-123',
                type: 'metadata',
                files: ['file1.tsv', 'file2.tsv']
            };

            const mockBatchResult = {
                _id: 'batch-123',
                submissionID: 'sub-123',
                type: 'metadata',
                files: ['file1.tsv', 'file2.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue(mockBatchResult);
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS,
                history: [
                    ...mockSubmission.history,
                    {
                        userID: 'user-123',
                        status: IN_PROGRESS,
                        dateTime: '2024-01-15T10:00:00.000Z'
                    }
                ]
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-123',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        expect.objectContaining({
                            userID: 'user-123',
                            status: IN_PROGRESS,
                            dateTime: '2024-01-15T10:00:00.000Z'
                        })
                    ]),
                    updatedAt: '2024-01-15T10:00:00.000Z'
                })
            );

            // Verify history was created correctly
            expect(HistoryEventBuilder.createEvent).toHaveBeenCalledWith('user-123', IN_PROGRESS, null);
        });

        it('should preserve existing history when adding new IN_PROGRESS status', async () => {
            // Arrange
            const existingHistory = [
                {
                    userID: 'user-123',
                    status: NEW,
                    dateTime: '2024-01-15T09:00:00.000Z'
                }
            ];

            const mockSubmission = {
                _id: 'sub-456',
                name: 'Test Submission 2',
                status: NEW,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: existingHistory,
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-456',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-456' });
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert - verify the update call included history with both old and new entries
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-456',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        // Original history entry
                        expect.objectContaining({
                            status: NEW,
                            dateTime: '2024-01-15T09:00:00.000Z'
                        }),
                        // New history entry
                        expect.objectContaining({
                            status: IN_PROGRESS,
                            dateTime: '2024-01-15T10:00:00.000Z'
                        })
                    ])
                })
            );

            const updateCall = mockSubmissionDAO.update.mock.calls[0][1];
            expect(updateCall.history).toHaveLength(2);
        });
    });

    describe('Status transition from WITHDRAWN to IN_PROGRESS', () => {
        it('should record history when status changes from WITHDRAWN to IN_PROGRESS', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-789',
                name: 'Withdrawn Submission',
                status: WITHDRAWN,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [
                    {
                        userID: 'user-123',
                        status: NEW,
                        dateTime: '2024-01-15T08:00:00.000Z'
                    },
                    {
                        userID: 'user-123',
                        status: WITHDRAWN,
                        dateTime: '2024-01-15T09:00:00.000Z'
                    }
                ],
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-789',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-789' });
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-789',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        expect.objectContaining({
                            status: IN_PROGRESS,
                            userID: 'user-123'
                        })
                    ])
                })
            );

            const updateCall = mockSubmissionDAO.update.mock.calls[0][1];
            expect(updateCall.history).toHaveLength(3); // NEW + WITHDRAWN + IN_PROGRESS
        });
    });

    describe('Status transition from REJECTED to IN_PROGRESS', () => {
        it('should record history when status changes from REJECTED to IN_PROGRESS', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-999',
                name: 'Rejected Submission',
                status: REJECTED,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [
                    {
                        userID: 'user-123',
                        status: NEW,
                        dateTime: '2024-01-15T08:00:00.000Z'
                    },
                    {
                        userID: 'admin-123',
                        status: REJECTED,
                        reviewComment: 'Needs revision',
                        dateTime: '2024-01-15T09:00:00.000Z'
                    }
                ],
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-999',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-999' });
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-999',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        expect.objectContaining({
                            status: IN_PROGRESS,
                            userID: 'user-123'
                        })
                    ])
                })
            );

            const updateCall = mockSubmissionDAO.update.mock.calls[0][1];
            expect(updateCall.history).toHaveLength(3); // NEW + REJECTED + IN_PROGRESS
        });
    });

    describe('Status should NOT change when already IN_PROGRESS', () => {
        it('should not update status when submission is already IN_PROGRESS', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-111',
                name: 'In Progress Submission',
                status: IN_PROGRESS,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [
                    {
                        userID: 'user-123',
                        status: NEW,
                        dateTime: '2024-01-15T08:00:00.000Z'
                    },
                    {
                        userID: 'user-123',
                        status: IN_PROGRESS,
                        dateTime: '2024-01-15T09:00:00.000Z'
                    }
                ],
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-111',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-111' });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert - update should NOT be called for status change
            expect(mockSubmissionDAO.update).not.toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        it('should handle submission with no existing history', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-222',
                name: 'No History Submission',
                status: NEW,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: null, // No history
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-222',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-222' });
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert - should create history array with IN_PROGRESS entry
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-222',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        expect.objectContaining({
                            status: IN_PROGRESS,
                            userID: 'user-123'
                        })
                    ])
                })
            );

            const updateCall = mockSubmissionDAO.update.mock.calls[0][1];
            expect(updateCall.history).toHaveLength(1);
        });

        it('should handle submission with empty history array', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-333',
                name: 'Empty History Submission',
                status: NEW,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [], // Empty history
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-333',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-333' });
            mockSubmissionDAO.update.mockResolvedValue({
                ...mockSubmission,
                status: IN_PROGRESS
            });

            // Act
            await submissionService.createBatch(batchParams, mockContext);

            // Assert
            expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
                'sub-333',
                expect.objectContaining({
                    status: IN_PROGRESS,
                    history: expect.arrayContaining([
                        expect.objectContaining({
                            status: IN_PROGRESS,
                            userID: 'user-123'
                        })
                    ])
                })
            );

            const updateCall = mockSubmissionDAO.update.mock.calls[0][1];
            expect(updateCall.history).toHaveLength(1);
        });

        it('should throw error if update fails', async () => {
            // Arrange
            const mockSubmission = {
                _id: 'sub-444',
                name: 'Failed Update Submission',
                status: NEW,
                studyID: 'study-123',
                dataCommons: 'DC1',
                bucketName: 'test-bucket',
                history: [],
                submitterID: 'user-123'
            };

            const batchParams = {
                submissionID: 'sub-444',
                type: 'metadata',
                files: ['file1.tsv']
            };

            mockSubmissionDAO.findByID.mockResolvedValue(mockSubmission);
            mockBatchService.createBatch.mockResolvedValue({ _id: 'batch-444' });
            mockSubmissionDAO.update.mockResolvedValue(null); // Simulate update failure

            // Act & Assert
            await expect(submissionService.createBatch(batchParams, mockContext))
                .rejects
                .toThrow(ERROR.UPDATE_SUBMISSION_ERROR);
        });
    });
});

