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
  let mockConfigurationService;

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

    mockConfigurationService = {
      findByType: jest.fn().mockResolvedValue(null)
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
      'export-queue',
      mockConfigurationService
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
      
      // Orphan S3 files without manifest rows count as error (validated + non-validated F008).
      // - new: dataFiles with NEW status (1) only
      // - error: all orphans + fileNotFound + dataFiles with ERROR (1+1+1+1) = 4
      // - passed: dataFiles with PASSED status (1) = 1
      // - warning: dataFiles with WARNING status (1) = 1
      // - total: 1 + 4 + 1 + 1 = 7
      expect(stat.new).toBe(1);
      expect(stat.error).toBe(4);
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
      
      // - new: dataFiles with NEW status (1)
      // - error: validated + nonValidated orphans + fileNotFound + dataFile ERROR = 2+1+1+1 = 5
      // - passed: dataFiles with PASSED status (1) = 1
      // - warning: dataFiles with WARNING status (0) = 0
      // - total: 1 + 5 + 1 + 0 = 7
      expect(stat.new).toBe(1);
      expect(stat.error).toBe(5);
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
      
      // All S3-only orphans count as error
      expect(stat.new).toBe(0);
      expect(stat.error).toBe(4); // validated + nonValidated + fileNotFound
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
      
      // All orphaned S3 keys count as error
      expect(stat.new).toBe(0);
      expect(stat.error).toBe(3);
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
    test('should send batched metadata validation messages for metadata type', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(3);
      mockDataRecordsCollection.aggregate.mockResolvedValue([
        { _id: 'rec-1' }, { _id: 'rec-2' }, { _id: 'rec-3' }
      ]);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: VALIDATION.BATCH_MESSAGE_TYPE,
          submissionID: 'submission-123',
          scope: VALIDATION.SCOPE.NEW,
          validationID: 'validation-456',
          dataRecordIds: ['rec-1', 'rec-2', 'rec-3'],
          totalBatches: 1,
          batchIndex: 0
        }),
        'submission-123-batch-0',
        expect.any(String),
        'metadata-queue'
      );

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    test('should query with status "New" (capital N) when scope is new', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(2);
      mockDataRecordsCollection.aggregate.mockResolvedValue([
        { _id: 'rec-1' }, { _id: 'rec-2' }
      ]);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      const aggregateCall = mockDataRecordsCollection.aggregate.mock.calls.find(
        call => call[0]?.[0]?.$match?.status !== undefined
      );
      expect(aggregateCall).toBeDefined();
      expect(aggregateCall[0][0].$match.status).toBe(VALIDATION_STATUS.NEW);
    });

    test('should query without status filter when scope is all', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(2);
      mockDataRecordsCollection.aggregate.mockResolvedValue([
        { _id: 'rec-1' }, { _id: 'rec-2' }
      ]);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      const aggregateCall = mockDataRecordsCollection.aggregate.mock.calls.find(
        call => call[0]?.[0]?.$match?.submissionID === 'submission-123' && call[0]?.[1]?.$project?._id === 1
      );
      expect(aggregateCall).toBeDefined();
      expect(aggregateCall[0][0].$match).not.toHaveProperty('status');
    });

    test('should send no metadata message when scope is new and no records found', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(5);
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      expect(mockAwsService.sendSQSMessage).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toContain(ERRORS.NO_NEW_VALIDATION_METADATA);
    });

    test('should report error when scope is all but _getDataRecordIds returns empty', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(5);
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(mockAwsService.sendSQSMessage).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toContain(ERRORS.NO_VALIDATION_METADATA);
    });

    test('should chunk data record IDs into multiple batch messages using default size', async () => {
      const ids = Array.from({ length: 1200 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(1200);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      // 1200 records / 1000 default batch size = 2 batches
      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      expect(metadataCalls).toHaveLength(2);

      metadataCalls.forEach((call, idx) => {
        const msg = call[0];
        expect(msg.totalBatches).toBe(2);
        expect(msg.batchIndex).toBe(idx);
        expect(msg.validationID).toBe('validation-456');
        expect(msg.submissionID).toBe('submission-123');
      });

      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(1000);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(200);

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    test('should use batch size from configuration collection', async () => {
      mockConfigurationService.findByType.mockResolvedValue({ size: 200 });
      const ids = Array.from({ length: 500 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(500);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(mockConfigurationService.findByType).toHaveBeenCalledWith(VALIDATION.METADATA_BATCH_CONFIG_TYPE);

      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      // 500 records / 200 configured batch size = 3 batches (200 + 200 + 100)
      expect(metadataCalls).toHaveLength(3);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(200);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(200);
      expect(metadataCalls[2][0].dataRecordIds).toHaveLength(100);
      // Each batch uses a distinct MessageGroupId for parallel processing
      expect(metadataCalls[0][1]).toBe('submission-123-batch-0');
      expect(metadataCalls[1][1]).toBe('submission-123-batch-1');
      expect(metadataCalls[2][1]).toBe('submission-123-batch-2');

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(3);
      expect(result.failedCount).toBe(0);
    });

    test('should clamp batch size to MAX_METADATA_BATCH_SIZE and log error when configured size exceeds limit', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const oversizedBatch = VALIDATION.MAX_METADATA_BATCH_SIZE + 1000;
      mockConfigurationService.findByType.mockResolvedValue({ size: oversizedBatch });
      const ids = Array.from({ length: VALIDATION.MAX_METADATA_BATCH_SIZE + 500 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(ids.length);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Configured METADATA_VALIDATION_BATCH_SIZE (${oversizedBatch}) exceeds maximum (${VALIDATION.MAX_METADATA_BATCH_SIZE})`)
      );

      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      // Should use MAX_METADATA_BATCH_SIZE (5000) instead of oversized value (6000)
      expect(metadataCalls).toHaveLength(2);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(VALIDATION.MAX_METADATA_BATCH_SIZE);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(500);

      expect(result.success).toBe(true);
      consoleErrorSpy.mockRestore();
    });

    test('should clamp batch size to MIN_METADATA_BATCH_SIZE and log error when configured size is below minimum', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const undersizedBatch = VALIDATION.MIN_METADATA_BATCH_SIZE - 50;
      mockConfigurationService.findByType.mockResolvedValue({ size: undersizedBatch });
      const ids = Array.from({ length: 250 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(ids.length);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Configured METADATA_VALIDATION_BATCH_SIZE (${undersizedBatch}) is below minimum (${VALIDATION.MIN_METADATA_BATCH_SIZE})`)
      );

      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      // 250 records / 100 min batch size = 3 batches (100 + 100 + 50)
      expect(metadataCalls).toHaveLength(3);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(VALIDATION.MIN_METADATA_BATCH_SIZE);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(VALIDATION.MIN_METADATA_BATCH_SIZE);
      expect(metadataCalls[2][0].dataRecordIds).toHaveLength(50);

      expect(result.success).toBe(true);
      consoleErrorSpy.mockRestore();
    });

    test('should allow batch size equal to MAX_METADATA_BATCH_SIZE without logging error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockConfigurationService.findByType.mockResolvedValue({ size: VALIDATION.MAX_METADATA_BATCH_SIZE });
      const ids = Array.from({ length: VALIDATION.MAX_METADATA_BATCH_SIZE }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(ids.length);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum')
      );

      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      expect(metadataCalls).toHaveLength(1);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(VALIDATION.MAX_METADATA_BATCH_SIZE);

      expect(result.success).toBe(true);
      consoleErrorSpy.mockRestore();
    });

    test('should fall back to default batch size when configurationService.findByType throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockConfigurationService.findByType.mockRejectedValue(new Error('DB connection failed'));
      const ids = Array.from({ length: 1200 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(1200);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read metadata validation batch size config'),
        expect.stringContaining('DB connection failed')
      );

      // 1200 records / 1000 default batch size = 2 batches
      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      expect(metadataCalls).toHaveLength(2);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(1000);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(200);

      expect(result.success).toBe(true);
      consoleErrorSpy.mockRestore();
    });

    test('should fall back to default batch size when configured size is 0', async () => {
      mockConfigurationService.findByType.mockResolvedValue({ size: 0 });
      const ids = Array.from({ length: 1200 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(1200);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage.mockResolvedValue({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.ALL,
        'validation-456'
      );

      // 1200 records / 1000 default batch size = 2 batches
      const metadataCalls = mockAwsService.sendSQSMessage.mock.calls.filter(
        call => call[0].type === VALIDATION.BATCH_MESSAGE_TYPE
      );
      expect(metadataCalls).toHaveLength(2);
      expect(metadataCalls[0][0].dataRecordIds).toHaveLength(1000);
      expect(metadataCalls[1][0].dataRecordIds).toHaveLength(200);

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

    test('should report errors when a batch message fails to send', async () => {
      mockDataRecordsCollection.countDoc.mockResolvedValue(2);
      mockDataRecordsCollection.aggregate.mockResolvedValue([
        { _id: 'rec-1' }, { _id: 'rec-2' }
      ]);
      mockAwsService.sendSQSMessage.mockRejectedValue(new Error('SQS failure'));

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain(ERRORS.FAILED_VALIDATE_METADATA);
      expect(result.totalBatches).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    test('should report partial SQS failures with correct failedCount', async () => {
      mockConfigurationService.findByType.mockResolvedValue({ size: 100 });
      const ids = Array.from({ length: 300 }, (_, i) => ({ _id: `rec-${i}` }));
      mockDataRecordsCollection.countDoc.mockResolvedValue(300);
      mockDataRecordsCollection.aggregate.mockResolvedValue(ids);
      mockAwsService.sendSQSMessage
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('SQS failure'))
        .mockResolvedValueOnce({ success: true });

      const result = await dataRecordService.validateMetadata(
        'submission-123',
        [VALIDATION.TYPES.METADATA],
        VALIDATION.SCOPE.NEW,
        'validation-456'
      );

      expect(result.success).toBe(false);
      expect(result.totalBatches).toBe(3);
      expect(result.failedCount).toBe(1);
    });
  });
}); 