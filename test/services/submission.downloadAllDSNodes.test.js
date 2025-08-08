const {Submission} = require('../../services/submission');
const fs = require('fs');
const path = require('path');

// Add this to mock prisma before any DAO/service import
jest.mock('../../prisma', () => ({}));
jest.mock('fs');
jest.mock('path');

// Mock zipFilesInDir to avoid archiver/stream errors in tests
beforeAll(() => {
    // Simulate success by default
    global.zipFilesInDir = jest.fn().mockResolvedValue();
});

describe('Submission.downloadAllDSNodes', () => {
    let submission;
    let mockContext;
    let mockParams;
    let mockSubmissionObj;
    let mockUserScope;
    let mockZipDir;
    let mockZipFile;
    let mockZipFileName;
    let mockDownloadUrl;

    beforeEach(() => {
        // Provide a mock organizationService with organizationCollection to avoid TypeError
        submission = new Submission(
            {}, // logCollection
            {}, // submissionCollection
            {}, // batchService
            {}, // userService
            { organizationCollection: {} }, // organizationService with organizationCollection
            {}, // notificationService
            {}, // dataRecordService
            () => ({}), // fetchDataModelInfo
            {}, // awsService
            '', // metadataQueueName
            {}, // s3Service
            {}, // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            {}, // validationCollection
            '', // sqsLoaderQueue
            {}, // qcResultsService
            {}, // uploaderCLIConfigs
            '', // submissionBucketName
            {}, // configurationService
            {}, // uploadingMonitor
            {}, // dataCommonsBucketMap
            {}, // authorizationService
            {}  // dataModelService
        );

        mockParams = { submissionID: 'sub123' };
        mockSubmissionObj = {
            _id: 'sub123',
            bucketName: 'bucket',
            rootPath: 'root',
            dataCommons: 'commons'
        };
        mockUserScope = { isNoneScope: jest.fn().mockReturnValue(false) };
        mockZipDir = '/tmp/dir';
        mockZipFile = '/tmp/dir.zip';
        mockZipFileName = 'dir.zip';
        mockDownloadUrl = 'https://signed-url';

        submission._findByID = jest.fn().mockResolvedValue(mockSubmissionObj);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission.dataRecordService = {
            retrieveAllDSNodes: jest.fn().mockResolvedValue(mockZipDir)
        };
        submission.s3Service = {
            uploadZipFile: jest.fn().mockResolvedValue(),
            createDownloadSignedURL: jest.fn().mockResolvedValue(mockDownloadUrl)
        };

        // Ensure zipFilesInDir is a mock for each test
        global.zipFilesInDir = jest.fn().mockResolvedValue();
        path.basename.mockReturnValue(mockZipFileName);
        path.dirname.mockReturnValue('/tmp');
        fs.existsSync.mockImplementation((filePath) => {
            // Only zipDir and zipFile exist
            return [mockZipDir, mockZipFile, '/tmp'].includes(filePath);
        });
        fs.rmSync.mockClear();

        mockContext = { userInfo: { _id: 'user1' } };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should throw if submission not found', async () => {
        submission._findByID.mockResolvedValue(null);
        await expect(submission.downloadAllDSNodes(mockParams, mockContext))
            .rejects.toThrow('The submission you are trying to access does not exist');
    });

    it('should throw if user has no permission', async () => {
        submission._getUserScope.mockResolvedValue({ isNoneScope: () => true });
        await expect(submission.downloadAllDSNodes(mockParams, mockContext))
            .rejects.toThrow('You do not have permission to perform this action.');
    });

    it('should throw if zipDir is not returned or does not exist', async () => {
        submission.dataRecordService.retrieveAllDSNodes.mockResolvedValue(null);
        fs.existsSync.mockReturnValue(false);
        await expect(submission.downloadAllDSNodes(mockParams, mockContext))
            .rejects.toThrow('Failed to download all data submission nodes');
    });

    it('should throw if zipFile does not exist after zipping', async () => {
        fs.existsSync.mockImplementation((filePath) => filePath === mockZipDir);
        // Simulate zipFilesInDir as a no-op (success)
        global.zipFilesInDir = jest.fn().mockResolvedValue();
        await expect(submission.downloadAllDSNodes(mockParams, mockContext))
            .rejects.toThrow('Failed to download all data submission nodes');
    });

    it('should cleanup zipFile and directory in finally block', async () => {
        await submission.downloadAllDSNodes(mockParams, mockContext);
        expect(fs.rmSync).toHaveBeenCalledWith('/tmp', { recursive: true, force: true });
    });

    it('should handle error during cleanup gracefully', async () => {
        fs.rmSync.mockImplementation(() => { throw new Error('cleanup error'); });
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await submission.downloadAllDSNodes(mockParams, mockContext);
        expect(spy).toHaveBeenCalledWith('Error during cleanup:', expect.any(Error));
        spy.mockRestore();
    });
});