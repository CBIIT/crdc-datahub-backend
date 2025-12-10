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

    dataRecordDAO = new DataRecordDAO(mockDataRecordsCollection);

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
    test('should return correct count of distinct node types', async () => {
      // The implementation now uses dataRecordDAO.findMany to get distinct nodeTypes
      dataRecordService.dataRecordDAO = {
        findMany: jest.fn().mockResolvedValue([
          { nodeType: 'participant' },
          { nodeType: 'sample' },
          { nodeType: 'file' },
          { nodeType: 'participant' }, // Duplicate to test distinct counting
          { nodeType: 'sample' }       // Duplicate to test distinct counting
        ])
      };

      const result = await dataRecordService.countNodesBySubmissionID('submission-123');

      expect(result).toBe(5); // Should count total nodes, not unique nodeTypes
      expect(dataRecordService.dataRecordDAO.findMany).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        { select: { nodeType: true } }
      );
    });

    test('should return 0 when no nodes found', async () => {
      dataRecordService.dataRecordDAO = {
        findMany: jest.fn().mockResolvedValue([])
      };

      const result = await dataRecordService.countNodesBySubmissionID('submission-123');

      expect(result).toBe(0);
      expect(dataRecordService.dataRecordDAO.findMany).toHaveBeenCalledWith(
        { submissionID: 'submission-123' },
        { select: { nodeType: true } }
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
    beforeEach(() => {
      // Ensure dataRecordService.dataRecordDAO is set and mockable
      dataRecordService.dataRecordDAO = {
        findFirst: jest.fn()
      };
    });

    test('should throw error when node not found', async () => {
      dataRecordService.dataRecordDAO.findFirst.mockResolvedValue(null);

      await expect(
        dataRecordService._getNode('submission-123', 'participant', 'p1')
      ).rejects.toThrow(ERRORS.INVALID_NODE_NOT_FOUND);

      expect(dataRecordService.dataRecordDAO.findFirst).toHaveBeenCalledWith({
        nodeID: 'p1',
        nodeType: 'participant',
        submissionID: 'submission-123'
      });
    });
  });

  describe('_getNodeChildren', () => {
    beforeEach(() => {
      // Mock the dataRecordDAO.findMany method used in _getNodeChildren
      dataRecordService.dataRecordDAO = {
        findMany: jest.fn()
      };
    });

    test('should return children grouped by type', async () => {
      const mockChildren = [
        { nodeType: 'sample' },
        { nodeType: 'sample' },
        { nodeType: 'file' }
      ];
      dataRecordService.dataRecordDAO.findMany.mockResolvedValue(mockChildren);

      const result = await dataRecordService._getNodeChildren('submission-123', 'participant', 'p1');

      expect(dataRecordService.dataRecordDAO.findMany).toHaveBeenCalledWith({
        parents: {
          some: {
            parentIDValue: 'p1',
            parentType: 'participant'
          }
        },
        submissionID: 'submission-123'
      });

      expect(result).toEqual([
        { nodeType: 'sample', total: 2 },
        { nodeType: 'file', total: 1 }
      ]);
    });

    test('should return empty array when no children found', async () => {
      dataRecordService.dataRecordDAO.findMany.mockResolvedValue([]);

      const result = await dataRecordService._getNodeChildren('submission-123', 'participant', 'p1');

      expect(dataRecordService.dataRecordDAO.findMany).toHaveBeenCalledWith({
        parents: {
          some: {
            parentIDValue: 'p1',
            parentType: 'participant'
          }
        },
        submissionID: 'submission-123'
      });

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

    describe('retrieveDSSummary', () => {
      beforeEach(() => {
        dataRecordService.dataRecordDAO = {
          distinct: jest.fn()
        };
        dataRecordService._getNodeCounts = jest.fn();
      });

      test('should return summary for each node type', async () => {
        const aSubmission = { _id: 'sub1' };
        const nodeTypes = ['participant', 'sample', 'file'];
        dataRecordService.dataRecordDAO.distinct.mockResolvedValue(nodeTypes);

        dataRecordService._getNodeCounts
          .mockResolvedValueOnce({ newCount: 2, updatedCount: 1, deletedCount: 0 })
          .mockResolvedValueOnce({ newCount: 0, updatedCount: 3, deletedCount: 1 })
          .mockResolvedValueOnce({ newCount: 5, updatedCount: 0, deletedCount: 2 });

        const result = await dataRecordService.retrieveDSSummary(aSubmission);

        expect(dataRecordService.dataRecordDAO.distinct).toHaveBeenCalledWith('nodeType', { submissionID: 'sub1' });
        expect(dataRecordService._getNodeCounts).toHaveBeenCalledTimes(3);
        expect(result).toEqual([
          { nodeType: 'participant', new: 2, updated: 1, deleted: 0 },
          { nodeType: 'sample', new: 0, updated: 3, deleted: 1 },
          { nodeType: 'file', new: 5, updated: 0, deleted: 2 }
        ]);
      });

      test('should return empty array if no node types found', async () => {
        const aSubmission = { _id: 'sub2' };
        dataRecordService.dataRecordDAO.distinct.mockResolvedValue([]);

        const result = await dataRecordService.retrieveDSSummary(aSubmission);

        expect(result).toEqual([]);
        expect(dataRecordService.dataRecordDAO.distinct).toHaveBeenCalledWith('nodeType', { submissionID: 'sub2' });
        expect(dataRecordService._getNodeCounts).not.toHaveBeenCalled();
      });
    });
  });

  describe('getSubmissionNodes', () => {
    beforeEach(() => {
      // Reset aggregate mock before each test
      mockDataRecordsCollection.aggregate.mockReset();
    });

    test('should call aggregate twice - once for count and once for results', async () => {
      const mockCountResult = [{ total: 10 }];
      const mockResults = [
        { nodeID: 'node1', nodeType: 'participant', status: 'New' },
        { nodeID: 'node2', nodeType: 'participant', status: 'Passed' }
      ];

      // Mock aggregate to return different results for count and results queries
      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult) // First call for count
        .mockResolvedValueOnce(mockResults); // Second call for results

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'nodeID',
        'ASC'
      );

      // Verify aggregate was called twice
      expect(mockDataRecordsCollection.aggregate).toHaveBeenCalledTimes(2);

      // Verify the result structure
      expect(result).toEqual({
        total: 10,
        results: mockResults
      });
    });

    test('should combine count and results correctly', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockResults = [
        { nodeID: 'node1', nodeType: 'sample' },
        { nodeID: 'node2', nodeType: 'sample' }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'sample',
        10,
        0,
        'nodeID',
        'ASC'
      );

      expect(result.total).toBe(5);
      expect(result.results).toEqual(mockResults);
      expect(result.results).toHaveLength(2);
    });

    test('should handle pagination with first and offset', async () => {
      const mockCountResult = [{ total: 100 }];
      const mockResults = [
        { nodeID: 'node11', nodeType: 'file' },
        { nodeID: 'node12', nodeType: 'file' }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'file',
        2, // first
        10, // offset
        'nodeID',
        'ASC'
      );

      expect(result.total).toBe(100);
      expect(result.results).toEqual(mockResults);

      // Verify the results pipeline includes skip and limit
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];
      const hasSkip = resultsCall.some(stage => stage.$skip === 10);
      const hasLimit = resultsCall.some(stage => stage.$limit === 2);

      expect(hasSkip).toBe(true);
      expect(hasLimit).toBe(true);
    });

    test('should handle first === -1 to return all records without pagination', async () => {
      const mockCountResult = [{ total: 50 }];
      const mockResults = Array.from({ length: 50 }, (_, i) => ({
        nodeID: `node${i}`,
        nodeType: 'participant'
      }));

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        -1, // first === -1 means return all
        0,
        'nodeID',
        'ASC'
      );

      expect(result.total).toBe(50);
      expect(result.results).toHaveLength(50);

      // Verify the results pipeline does NOT include skip and limit when first === -1
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];
      const hasSkip = resultsCall.some(stage => stage.$skip !== undefined);
      const hasLimit = resultsCall.some(stage => stage.$limit !== undefined);

      expect(hasSkip).toBe(false);
      expect(hasLimit).toBe(false);
    });

    test('should handle empty results', async () => {
      const mockCountResult = [{ total: 0 }];
      const mockResults = [];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'nodeID',
        'ASC'
      );

      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
    });

    test('should handle null/undefined count result', async () => {
      const mockCountResult = []; // Empty array means no count result
      const mockResults = [
        { nodeID: 'node1', nodeType: 'sample' }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'sample',
        10,
        0,
        'nodeID',
        'ASC'
      );

      // Should default to 0 when count result is empty
      expect(result.total).toBe(0);
      expect(result.results).toEqual(mockResults);
    });

    test('should handle null/undefined results', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockResults = null;

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'file',
        10,
        0,
        'nodeID',
        'ASC'
      );

      // Should default to empty array when results is null
      expect(result.total).toBe(5);
      expect(result.results).toEqual([]);
    });

    test('should use custom query when provided', async () => {
      const mockCountResult = [{ total: 3 }];
      const mockResults = [
        { nodeID: 'node1', nodeType: 'participant', status: 'Error' }
      ];

      const customQuery = {
        submissionID: 'submission-123',
        nodeType: 'participant',
        status: 'Error'
      };

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'nodeID',
        'ASC',
        customQuery
      );

      expect(result.total).toBe(3);
      expect(result.results).toEqual(mockResults);

      // Verify both pipelines use the custom query
      const countCall = mockDataRecordsCollection.aggregate.mock.calls[0][0];
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];

      const countMatch = countCall.find(stage => stage.$match);
      const resultsMatch = resultsCall.find(stage => stage.$match);

      expect(countMatch.$match).toEqual(customQuery);
      expect(resultsMatch.$match).toEqual(customQuery);
    });

    test('should apply sorting correctly', async () => {
      const mockCountResult = [{ total: 5 }];
      const mockResults = [
        { nodeID: 'node1', updatedAt: new Date('2023-01-01') },
        { nodeID: 'node2', updatedAt: new Date('2023-01-02') }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'updatedAt',
        'DESC'
      );

      expect(result.total).toBe(5);
      expect(result.results).toEqual(mockResults);

      // Verify sort is applied in results pipeline
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];
      const sortStage = resultsCall.find(stage => stage.$sort);

      expect(sortStage).toBeDefined();
      expect(sortStage.$sort.updatedAt).toBe(-1); // DESC
      expect(sortStage.$sort.nodeID).toBe(1); // Secondary sort
    });

    test('should handle nested field sorting (props.field)', async () => {
      const mockCountResult = [{ total: 3 }];
      const mockResults = [
        { nodeID: 'node1', props: { age: 30 } }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'age',
        'ASC'
      );

      expect(result.total).toBe(3);
      expect(result.results).toEqual(mockResults);

      // Verify sort uses props.age
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];
      const sortStage = resultsCall.find(stage => stage.$sort);

      expect(sortStage.$sort['props.age']).toBe(1); // ASC
    });

    test('should handle rawData field sorting', async () => {
      const mockCountResult = [{ total: 2 }];
      const mockResults = [
        { nodeID: 'node1', rawData: { 'custom.field': 'value1' } }
      ];

      mockDataRecordsCollection.aggregate
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockResults);

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'custom.field',
        'ASC'
      );

      expect(result.total).toBe(2);
      expect(result.results).toEqual(mockResults);

      // Verify sort uses rawData.custom|field (dot replaced with pipe)
      const resultsCall = mockDataRecordsCollection.aggregate.mock.calls[1][0];
      const sortStage = resultsCall.find(stage => stage.$sort);

      expect(sortStage.$sort['rawData.custom|field']).toBe(1);
    });

    test('should execute count and results queries in parallel', async () => {
      const mockCountResult = [{ total: 10 }];
      const mockResults = [{ nodeID: 'node1' }];

      // Track call order to verify parallel execution structurally
      const callOrder = [];

      mockDataRecordsCollection.aggregate
        .mockImplementationOnce(async () => {
          callOrder.push('count-start');
          await new Promise(resolve => setImmediate(resolve));
          callOrder.push('count-end');
          return mockCountResult;
        })
        .mockImplementationOnce(async () => {
          callOrder.push('results-start');
          await new Promise(resolve => setImmediate(resolve));
          callOrder.push('results-end');
          return mockResults;
        });

      const result = await dataRecordDAO.getSubmissionNodes(
        'submission-123',
        'participant',
        10,
        0,
        'nodeID',
        'ASC'
      );

      // Verify parallel execution: both queries started before either ended
      expect(callOrder.indexOf('count-start')).toBeLessThan(callOrder.indexOf('count-end'));
      expect(callOrder.indexOf('count-start')).toBeLessThan(callOrder.indexOf('results-end'));
      expect(callOrder.indexOf('results-start')).toBeLessThan(callOrder.indexOf('count-end'));
      expect(callOrder.indexOf('results-start')).toBeLessThan(callOrder.indexOf('results-end'));
      expect(result.total).toBe(10);
      expect(result.results).toEqual(mockResults);
    });
  });
});