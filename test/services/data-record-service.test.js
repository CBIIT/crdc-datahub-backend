const { DataRecordService } = require('../../services/data-record-service');
const { VALIDATION_STATUS, VALIDATION, DATA_FILE } = require('../../constants/submission-constants');
const ERRORS = require('../../constants/error-constants');
const { BATCH } = require('../../crdc-datahub-database-drivers/constants/batch-constants');
const DataRecordDAO = require("../../dao/dataRecords");

const FILE = 'file';

// Mock ValidationHandler
const ValidationHandler = {
  success: jest.fn(() => ({ success: true })),
  handle: jest.fn((errors) => ({ success: false, errors }))
};

// Mock Message class
const Message = {
  createMetadataMessage: jest.fn(),
  createFileSubmissionMessage: jest.fn(),
  createFileNodeMessage: jest.fn()
};

// Mock Stat class
const Stat = {
  createStat: jest.fn()
};

// Mock the utility functions
jest.mock('../../utility/validation-handler', () => ({
  ValidationHandler: {
    success: jest.fn(() => ({ success: true })),
    handle: jest.fn((errors) => ({ success: false, errors }))
  }
}));

jest.mock('../../services/data-record-service', () => {
  const originalModule = jest.requireActual('../../services/data-record-service');
  return {
    ...originalModule,
    Message: {
      createMetadataMessage: jest.fn(),
      createFileSubmissionMessage: jest.fn(),
      createFileNodeMessage: jest.fn()
    },
    Stat: {
      createStat: jest.fn()
    }
  };
});

describe('DataRecordService', () => {
  let dataRecordService;
  let mockDataRecordsCollection;
  let mockDataRecordArchiveCollection;
  let mockReleaseCollection;
  let mockAwsService;
  let mockS3Service;
  let mockQcResultsService;
  let dataRecordDAO;

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

    dataRecordDAO = new DataRecordDAO();

    // Mock static methods - these are now handled by the jest.mock calls above
  });

  describe('Constructor', () => {
    test('should initialize with all dependencies', () => {
      expect(dataRecordService.dataRecordsCollection).toBe(mockDataRecordsCollection);
      expect(dataRecordService.dataRecordArchiveCollection).toBe(mockDataRecordArchiveCollection);
      expect(dataRecordService.releaseCollection).toBe(mockReleaseCollection);
      expect(dataRecordService.awsService).toBe(mockAwsService);
      expect(dataRecordService.s3Service).toBe(mockS3Service);
      expect(dataRecordService.qcResultsService).toBe(mockQcResultsService);
      expect(dataRecordService.fileQueueName).toBe('file-queue');
      expect(dataRecordService.metadataQueueName).toBe('metadata-queue');
      expect(dataRecordService.exportQueue).toBe('export-queue');
    });
  });

  describe('_dataFilesStats', () => {
    test('should correctly categorize files', () => {
      const s3SubmissionFiles = ['file1.txt', 'file2.txt', 'file3.txt'];
      const fileRecords = [
        { s3FileInfo: { fileName: 'file1.txt', status: 'New' } },
        { s3FileInfo: { fileName: 'file2.txt', status: 'Error' } }
      ];

      const [orphanedFiles, dataFiles, missingErrorFileSet] = dataRecordService._dataFilesStats(s3SubmissionFiles, fileRecords);

      expect(orphanedFiles).toEqual(['file3.txt']);
      expect(dataFiles).toHaveLength(2);
      expect(missingErrorFileSet).toEqual(new Set());
    });

    test('should handle empty inputs', () => {
      const [orphanedFiles, dataFiles, missingErrorFileSet] = dataRecordService._dataFilesStats([], []);

      expect(orphanedFiles).toEqual([]);
      expect(dataFiles).toEqual([]);
      expect(missingErrorFileSet).toEqual(new Set());
    });

    test('should handle null inputs', () => {
      const [orphanedFiles, dataFiles, missingErrorFileSet] = dataRecordService._dataFilesStats(null, null);
      expect(orphanedFiles).toEqual([]);
      expect(dataFiles).toEqual([]);
      expect(missingErrorFileSet).toEqual(new Set());
    });

    test('should handle undefined inputs', () => {
      const [orphanedFiles, dataFiles, missingErrorFileSet] = dataRecordService._dataFilesStats(undefined, undefined);
      expect(orphanedFiles).toEqual([]);
      expect(dataFiles).toEqual([]);
      expect(missingErrorFileSet).toEqual(new Set());
    });
  });

  describe('_saveDataFileStats', () => {
    test('should not add stats when total is 0', () => {
      // This test does not rely on static method mocks
      const mockStat = {
        countNodeType: jest.fn(),
        total: 0
      };
      // Stat.createStat is not called, so we don't need to mock it
      const submissionStats = { stats: [] };
      dataRecordService._saveDataFileStats(submissionStats, [], [], [], []);
      expect(submissionStats.stats).toEqual([]);
    });
  });

  describe('_replaceNaN', () => {
    test('should replace NaN values with replacement', () => {
      const results = [
        { value: 1, nanValue: NaN },
        { value: 2, nanValue: 3 }
      ];

      const replaced = dataRecordDAO._replaceNaN(results, null);

      expect(replaced[0].nanValue).toBe(null);
      expect(replaced[1].nanValue).toBe(3);
    });

    test('should handle empty array', () => {
      const results = [];
      const replaced = dataRecordDAO._replaceNaN(results, 0);
      expect(replaced).toEqual([]);
    });

    test('should handle null input', () => {
      const replaced = dataRecordDAO._replaceNaN(null, 0);
      expect(replaced).toBeNull();
    });

    test('should handle undefined input', () => {
      const replaced = dataRecordDAO._replaceNaN(undefined, 0);
      expect(replaced).toBeUndefined();
    });
  });

  describe('_convertParents', () => {
    test('should convert parents array to grouped format', () => {
      const parents = [
        { parentType: 'participant', parentIDValue: 'p1' },
        { parentType: 'participant', parentIDValue: 'p2' },
        { parentType: 'sample', parentIDValue: 's1' }
      ];

      const result = dataRecordService._convertParents(parents);

      expect(result).toEqual([
        { nodeType: 'participant', total: 2 },
        { nodeType: 'sample', total: 1 }
      ]);
    });

    test('should handle empty parents array', () => {
      const result = dataRecordService._convertParents([]);
      expect(result).toEqual([]);
    });

    test('should handle null parents', () => {
      const result = dataRecordService._convertParents(null);
      expect(result).toEqual([]);
    });

    test('should handle undefined parents', () => {
      const result = dataRecordService._convertParents(undefined);
      expect(result).toEqual([]);
    });
  });

  describe('countNodesBySubmissionID', () => {
    test('should return correct count of nodes', async () => {
      // The implementation uses dataRecordDAO.count, not aggregate
      dataRecordService.dataRecordDAO = {
        count: jest.fn().mockResolvedValue(5)
      };

      const result = await dataRecordService.countNodesBySubmissionID('submission-123');

      expect(result).toBe(5);
      expect(dataRecordService.dataRecordDAO.count).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        ['nodeType']
      );
    });

    test('should return 0 when no nodes found', async () => {
      dataRecordService.dataRecordDAO = {
        count: jest.fn().mockResolvedValue(0)
      };

      const result = await dataRecordService.countNodesBySubmissionID('submission-123');

      expect(result).toBe(0);
      expect(dataRecordService.dataRecordDAO.count).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        ['nodeType']
      );
    });
  });

  describe('listSubmissionNodeTypes', () => {
    test('should return distinct node types', async () => {
      dataRecordService.dataRecordDAO = {
        findMany: jest.fn().mockResolvedValue([
          { nodeType: 'participant' },
          { nodeType: 'sample' },
          { nodeType: 'file' }
        ])
      };

      const result = await dataRecordService.listSubmissionNodeTypes('submission-123');

      expect(result).toEqual(['participant', 'sample', 'file']);
      expect(dataRecordService.dataRecordDAO.findMany).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        { select: { nodeType: true } }
      );
    });

    test('should return empty array for null submissionID', async () => {
      const result = await dataRecordService.listSubmissionNodeTypes(null);
      expect(result).toEqual([]);
    });
  });

  describe('submissionDataFiles', () => {
    test('should return file data for given S3 file names', async () => {
      const mockFiles = [
        { s3FileInfo: { fileName: 'file1.txt', status: 'New' } },
        { s3FileInfo: { fileName: 'file2.txt', status: 'Passed' } }
      ];
      mockDataRecordsCollection.aggregate.mockResolvedValue(mockFiles);

      const result = await dataRecordService.submissionDataFiles('submission-123', ['file1.txt', 'file2.txt']);

      expect(result).toEqual(mockFiles);
      expect(mockDataRecordsCollection.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            submissionID: 'submission-123',
            s3FileInfo: { $exists: true, $ne: null },
            's3FileInfo.fileName': { $in: ['file1.txt', 'file2.txt'] }
          }
        },
        {
          $project: {
            _id: 0,
            nodeID: '$s3FileInfo.fileName',
            status: '$s3FileInfo.status'
          }
        }
      ]);
    });
  });

  describe('deleteMetadataByFilter', () => {
    test('should delete metadata by filter', async () => {
      mockDataRecordsCollection.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await dataRecordService.deleteMetadataByFilter({ submissionID: 'submission-123' });

      expect(result).toEqual({ deletedCount: 5 });
      expect(mockDataRecordsCollection.deleteMany).toHaveBeenCalledWith({ submissionID: 'submission-123' });
    });
  });

  describe('archiveMetadataByFilter', () => {
    test('should archive metadata by filter', async () => {
      const mockData = [{ _id: '1', data: 'test' }];
      mockDataRecordsCollection.aggregate.mockResolvedValue(mockData);
      mockDataRecordArchiveCollection.insertMany.mockResolvedValue({ insertedCount: 1 });
      mockDataRecordsCollection.deleteMany.mockResolvedValue({ deletedCount: 1 });

      const result = await dataRecordService.archiveMetadataByFilter({ submissionID: 'submission-123' });

      expect(result).toHaveLength(2);
      expect(mockDataRecordsCollection.aggregate).toHaveBeenCalledWith([{ $match: { submissionID: 'submission-123' } }]);
      expect(mockDataRecordArchiveCollection.insertMany).toHaveBeenCalledWith(mockData);
      expect(mockDataRecordsCollection.deleteMany).toHaveBeenCalledWith({ submissionID: 'submission-123' });
    });

    test('should return null when no data found', async () => {
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);

      const result = await dataRecordService.archiveMetadataByFilter({ submissionID: 'submission-123' });

      expect(result).toBeNull();
    });
  });

  describe('resetDataRecords', () => {
    test('should reset data records status', async () => {
      mockDataRecordsCollection.updateMany.mockResolvedValue({ modifiedCount: 10 });

      const result = await dataRecordService.resetDataRecords('submission-123', 'New');

      expect(result).toEqual({ modifiedCount: 10 });
      expect(mockDataRecordsCollection.updateMany).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        expect.arrayContaining([
          expect.objectContaining({
            $set: expect.objectContaining({
              status: 'New'
            })
          })
        ])
      );
    });
  });

  describe('_getSubmissionStatQuery', () => {
    test('should return correct aggregation pipeline', () => {
      const validNodeStatus = ['New', 'Passed', 'Warning', 'Error'];
      const result = dataRecordService._getSubmissionStatQuery('submission-123', validNodeStatus);

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toEqual({
        $match: {
          submissionID: 'submission-123',
          status: { $in: validNodeStatus }
        }
      });
    });
  });



  describe('_getNode', () => {
    test('should throw error when node not found', async () => {
      dataRecordDAO.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        dataRecordService._getNode('submission-123', 'participant', 'p1')
      ).rejects.toThrow(ERRORS.INVALID_NODE_NOT_FOUND);

      expect(dataRecordDAO.findFirst).toHaveBeenCalledWith({
        submissionID: 'submission-123',
        nodeType: 'participant',
        nodeID: 'p1'
      });
    });

    test('should throw error when node not found', async () => {
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);

      await expect(dataRecordService._getNode('submission-123', 'participant', 'p1'))
        .rejects.toThrow(ERRORS.INVALID_NODE_NOT_FOUND);
    });
  });

  describe('_getNodeChildren', () => {
    test('should return children grouped by type', async () => {
      const mockChildren = [
        { nodeType: 'sample' },
        { nodeType: 'sample' },
        { nodeType: 'file' }
      ];
      mockDataRecordsCollection.aggregate.mockResolvedValue(mockChildren);

      const result = await dataRecordService._getNodeChildren('submission-123', 'participant', 'p1');

      expect(result).toEqual([
        { nodeType: 'sample', total: 2 },
        { nodeType: 'file', total: 1 }
      ]);
    });

    test('should return empty array when no children found', async () => {
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);

      const result = await dataRecordService._getNodeChildren('submission-123', 'participant', 'p1');

      expect(result).toEqual([]);
    });
  });

  describe('_getAgeAtDiagnosisByParticipant', () => {
    test('should return age at diagnosis when found', async () => {
      const mockDiagnosis = [{ props: { age_at_diagnosis: 45 } }];
      mockDataRecordsCollection.aggregate.mockResolvedValue(mockDiagnosis);

      const result = await dataRecordService._getAgeAtDiagnosisByParticipant('p1', 'submission-123');

      expect(result).toBe(45);
    });

    test('should return null when no diagnosis found', async () => {
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);

      const result = await dataRecordService._getAgeAtDiagnosisByParticipant('p1', 'submission-123');

      expect(result).toBeNull();
    });
  });

  describe('_getGenomicInfoByFile', () => {
    test('should return genomic info when found', async () => {
      const mockGenomicInfo = [
        { _id: 'g1', props: { library_id: 'lib1' } },
        { _id: 'g2', props: { library_id: 'lib2' } }
      ];
      mockDataRecordsCollection.aggregate.mockResolvedValue(mockGenomicInfo);

      const result = await dataRecordService._getGenomicInfoByFile('file1', 'submission-123');

      expect(result).toEqual(mockGenomicInfo);
    });

    test('should return empty array when no genomic info found', async () => {
      mockDataRecordsCollection.aggregate.mockResolvedValue([]);

      const result = await dataRecordService._getGenomicInfoByFile('file1', 'submission-123');

      expect(result).toEqual([]);
    });
  });
}); 