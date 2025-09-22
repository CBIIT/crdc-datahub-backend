const { DataRecordService, Stat, Message } = require('../../services/data-record-service');

// Mock constants
const { VALIDATION_STATUS, VALIDATION, DATA_FILE } = require('../../constants/submission-constants');
const ERRORS = require('../../constants/error-constants');
const { BATCH } = require('../../crdc-datahub-database-drivers/constants/batch-constants');

const FILE = 'file';

// These are technically integration tests because use actual Stat and Message class instances instead of mocking them

describe('DataRecordService Integration Tests', () => {
  let dataRecordService;
  let mockDataRecordsCollection;
  let mockDataRecordArchiveCollection;
  let mockReleaseCollection;
  let mockAwsService;
  let mockS3Service;
  let mockQcResultsService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock collections
    mockDataRecordsCollection = {
      aggregate: jest.fn(),
      countDoc: jest.fn(),
      distinct: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn()
    };

    mockDataRecordArchiveCollection = {
      insertMany: jest.fn()
    };

    mockReleaseCollection = {
      aggregate: jest.fn()
    };

    // Mock services
    mockAwsService = {
      sendSQSMessage: jest.fn()
    };

    mockS3Service = {
      listFileInDir: jest.fn()
    };

    mockQcResultsService = {
      findBySubmissionErrorCodes: jest.fn()
    };

    // Create service instance
    dataRecordService = new DataRecordService(
      mockDataRecordsCollection,
      mockDataRecordArchiveCollection,
      mockReleaseCollection,
      'file-queue',
      'metadata-queue',
      mockAwsService,
      mockS3Service,
      mockQcResultsService,
      'export-queue'
    );
  });

  describe('_saveDataFileStats Integration', () => {
    test('should create and add stats when there are files', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = ['file1.txt'];
      const nonValidatedOrphanedFiles = ['file2.txt'];
      const fileNotFoundErrors = ['file3.txt'];
      const dataFiles = [
        { status: VALIDATION_STATUS.NEW },
        { status: VALIDATION_STATUS.PASSED },
        { status: VALIDATION_STATUS.WARNING },
        { status: VALIDATION_STATUS.ERROR }
      ];

      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles);

      // Verify that stats were added to submissionStats
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBeInstanceOf(Stat);
      
      // Verify the stat has the correct properties
      const stat = submissionStats.stats[0];
      expect(stat.nodeName).toBe(DATA_FILE);
      
      // The logic is:
      // - new: nonValidatedOrphanedFiles.length (1) + dataFiles with NEW status (1) = 2
      // - error: validatedOrphanedFiles.length (1) + fileNotFoundErrors.length (1) + dataFiles with ERROR status (1) = 3
      // - passed: dataFiles with PASSED status (1) = 1
      // - warning: dataFiles with WARNING status (1) = 1
      // - total: 2 + 3 + 1 + 1 = 7
      expect(stat.new).toBe(2);
      expect(stat.error).toBe(3);
      expect(stat.passed).toBe(1);
      expect(stat.warning).toBe(1);
      expect(stat.total).toBe(7);
    });

    test('should not add stats when total is 0', () => {
      const submissionStats = { stats: [] };

      dataRecordService._saveDataFileStats(submissionStats, [], [], [], []);

      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle mixed file statuses correctly', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = ['file1.txt', 'file2.txt'];
      const nonValidatedOrphanedFiles = ['file3.txt'];
      const fileNotFoundErrors = ['file4.txt'];
      const dataFiles = [
        { status: VALIDATION_STATUS.NEW },
        { status: VALIDATION_STATUS.PASSED },
        { status: VALIDATION_STATUS.ERROR }
      ];

      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles);

      expect(submissionStats.stats).toHaveLength(1);
      const stat = submissionStats.stats[0];
      
      // The logic is:
      // - new: nonValidatedOrphanedFiles.length (1) + dataFiles with NEW status (1) = 2
      // - error: validatedOrphanedFiles.length (2) + fileNotFoundErrors.length (1) + dataFiles with ERROR status (1) = 4
      // - passed: dataFiles with PASSED status (1) = 1
      // - warning: dataFiles with WARNING status (0) = 0
      // - total: 2 + 4 + 1 + 0 = 7
      expect(stat.new).toBe(2);
      expect(stat.error).toBe(4);
      expect(stat.passed).toBe(1);
      expect(stat.warning).toBe(0);
      expect(stat.total).toBe(7);
    });

    test('should handle only orphaned files (no data files)', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = ['file1.txt', 'file2.txt'];
      const nonValidatedOrphanedFiles = ['file3.txt'];
      const fileNotFoundErrors = ['file4.txt'];
      const dataFiles = [];

      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles);

      expect(submissionStats.stats).toHaveLength(1);
      const stat = submissionStats.stats[0];
      
      // Only orphaned files count
      expect(stat.new).toBe(1); // nonValidatedOrphanedFiles
      expect(stat.error).toBe(3); // validatedOrphanedFiles + fileNotFoundErrors
      expect(stat.passed).toBe(0);
      expect(stat.warning).toBe(0);
      expect(stat.total).toBe(4);
    });

    test('should handle only data files (no orphaned files)', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = [];
      const nonValidatedOrphanedFiles = [];
      const fileNotFoundErrors = [];
      const dataFiles = [
        { status: VALIDATION_STATUS.NEW },
        { status: VALIDATION_STATUS.PASSED },
        { status: VALIDATION_STATUS.WARNING },
        { status: VALIDATION_STATUS.ERROR }
      ];

      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles);

      expect(submissionStats.stats).toHaveLength(1);
      const stat = submissionStats.stats[0];
      
      // Only data files count
      expect(stat.new).toBe(1);
      expect(stat.error).toBe(1);
      expect(stat.passed).toBe(1);
      expect(stat.warning).toBe(1);
      expect(stat.total).toBe(4);
    });

    test('should handle data files with unknown status', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = [];
      const nonValidatedOrphanedFiles = [];
      const fileNotFoundErrors = [];
      const dataFiles = [
        { status: 'UNKNOWN_STATUS' },
        { status: VALIDATION_STATUS.PASSED }
      ];

      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles);

      expect(submissionStats.stats).toHaveLength(1);
      const stat = submissionStats.stats[0];
      
      // Unknown status should not be counted in any category
      expect(stat.new).toBe(0);
      expect(stat.error).toBe(0);
      expect(stat.passed).toBe(1);
      expect(stat.warning).toBe(0);
      expect(stat.total).toBe(1);
    });

    test('should handle empty data files array', () => {
      const submissionStats = { stats: [] };
      const validatedOrphanedFiles = ['file1.txt'];
      const nonValidatedOrphanedFiles = ['file2.txt'];
      const fileNotFoundErrors = ['file3.txt'];

      // Test with empty dataFiles array
      dataRecordService._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, []);

      expect(submissionStats.stats).toHaveLength(1);
      const stat = submissionStats.stats[0];
      
      // Should only count orphaned files
      expect(stat.new).toBe(1);
      expect(stat.error).toBe(2);
      expect(stat.passed).toBe(0);
      expect(stat.warning).toBe(0);
      expect(stat.total).toBe(3);
    });
  });

  describe('exportMetadata Integration', () => {
    test('should create correct message and attempt to send via SQS', async () => {
      // Mock successful SQS send
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.exportMetadata('submission-123');

      // Verify SQS message was sent
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Export Metadata',
          submissionID: 'submission-123'
        }),
        'submission-123',
        'submission-123',
        'export-queue'
      );

      // Verify the result indicates success
      expect(result.success).toBe(true);
    });

    test('should handle SQS send failure', async () => {
      // Mock failed SQS send
      const errorMessage = 'SQS send failed';
      mockAwsService.sendSQSMessage.mockRejectedValue(new Error(errorMessage));

      const result = await dataRecordService.exportMetadata('submission-123');

      // Verify SQS message was attempted
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalled();

      // Verify the result indicates failure
      expect(result.success).toBe(false);
      expect(result.message).toContain('export-queue');
    });

    test('should create message with correct structure', async () => {
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      await dataRecordService.exportMetadata('submission-456');

      // Verify the message structure
      const messageCall = mockAwsService.sendSQSMessage.mock.calls[0];
      const message = messageCall[0];
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Export Metadata');
      expect(message.submissionID).toBe('submission-456');
      expect(message.validationID).toBeUndefined(); // No validationID for export
    });

    test('should handle empty submission ID', async () => {
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.exportMetadata('');

      // Should still attempt to send message
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Export Metadata',
          submissionID: ''
        }),
        '',
        '',
        'export-queue'
      );

      expect(result.success).toBe(true);
    });

    test('should handle null submission ID', async () => {
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.exportMetadata(null);

      // Should still attempt to send message
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Export Metadata',
          submissionID: null
        }),
        null,
        null,
        'export-queue'
      );

      expect(result.success).toBe(true);
    });

    test('should handle SQS timeout error', async () => {
      // Mock timeout error
      const timeoutError = new Error('SQS timeout');
      timeoutError.name = 'TimeoutError';
      mockAwsService.sendSQSMessage.mockRejectedValue(timeoutError);

      const result = await dataRecordService.exportMetadata('submission-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('export-queue');
    });

    test('should handle SQS permission error', async () => {
      // Mock permission error
      const permissionError = new Error('Access denied');
      permissionError.name = 'AccessDenied';
      mockAwsService.sendSQSMessage.mockRejectedValue(permissionError);

      const result = await dataRecordService.exportMetadata('submission-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('export-queue');
    });
  });

  describe('validateMetadata Integration', () => {
    test('should create metadata validation message for metadata type', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(10);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      // Verify SQS message was sent for metadata validation
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Validate Metadata',
          submissionID: 'submission-123',
          scope: VALIDATION.SCOPE.NEW,
          validationID: 'validation-456'
        }),
        'submission-123',
        'submission-123',
        'metadata-queue'
      );

      expect(result.success).toBe(true);
    });

    test('should create cross-submission validation message', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(10);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.CROSS_SUBMISSION],
        null,
        'validation-456'
      );

      // Verify SQS message was sent for cross-submission validation
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Validate Cross-submission',
          submissionID: 'submission-123',
          validationID: 'validation-456'
        }),
        'submission-123',
        'submission-123',
        'metadata-queue'
      );

      expect(result.success).toBe(true);
    });


    test('should create file validation messages for file type', async () => {
      const mockFileNodes = [
        { _id: 'file1', s3FileInfo: { status: 'New' } },
        { _id: 'file2', s3FileInfo: { status: 'New' } }
      ];

      mockDataRecordsCollection.aggregate.mockResolvedValue(mockFileNodes);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.FILE],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      // Verify SQS messages were sent for file validation
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Validate File',
          dataRecordID: 'file1',
          validationID: 'validation-456'
        }),
        'file1',
        'file1',
        'file-queue'
      );

      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Validate File',
          dataRecordID: 'file2',
          validationID: 'validation-456'
        }),
        'file2',
        'file2',
        'file-queue'
      );

      // Verify submission file validation message
      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Validate Submission Files',
          submissionID: 'submission-123',
          validationID: 'validation-456'
        }),
        'submission-123',
        'submission-123',
        'file-queue'
      );

      expect(result.success).toBe(true);
    });
  });
}); 