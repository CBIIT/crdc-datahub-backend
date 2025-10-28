
const ERROR = require('../../constants/error-constants');
const {BatchService} = require("../../services/batch-service");

jest.mock('../../dao/batch');

describe('BatchService', () => {
    let batchService;
    let mockS3Service;
    let mockSqsLoaderQueue;
    let mockAwsService;
    let mockFetchDataModelInfo;
    let mockBatchDAO;

    beforeEach(() => {
        mockS3Service = {
            createPreSignedURL: jest.fn(),
            listFileInDir: jest.fn(),
            downloadFile: jest.fn(),
            uploadZipFile: jest.fn(),
            createDownloadSignedURL: jest.fn()
        };



        mockSqsLoaderQueue = 'test-queue';

        mockAwsService = {
            sendSQSMessage: jest.fn()
        };

        mockFetchDataModelInfo = jest.fn().mockResolvedValue({
            'test-commons': {
                'omit-DCF-prefix': false
            }
        });

        // Mock BatchDAO
        const BatchDAO = require('../../dao/batch');
        mockBatchDAO = {
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            deleteByFilter: jest.fn(),
            findByStatus: jest.fn(),
            getNextDisplayID: jest.fn(),
            getLastFileBatchID: jest.fn()
        };
        BatchDAO.mockImplementation(() => mockBatchDAO);

        batchService = new BatchService(
            mockS3Service,
            mockSqsLoaderQueue,
            mockAwsService,
            'https://api.example.com',
            mockFetchDataModelInfo
        );
    });

    describe('createBatch', () => {
        const mockSubmission = {
            _id: 'sub1',
            bucketName: 'test-bucket',
            rootPath: 'test/root',
            studyID: 'study1',
            dataCommons: 'test-commons'
        };

        const mockUser = {
            _id: 'user1',
            firstName: 'John',
            lastName: 'Doe'
        };

        it('should create metadata batch successfully', async () => {
            const params = {
                submissionID: 'sub1',
                type: 'METADATA',
                files: ['file1.tsv', 'file2.tsv']
            };

            mockBatchDAO.getNextDisplayID.mockResolvedValue(3);
            mockS3Service.createPreSignedURL.mockResolvedValue('https://signed-url.com/file');
            mockBatchDAO.create.mockResolvedValue({
                _id: 'batch1',
                displayID: 3,
                type: 'metadata',
                files: [
                    {fileName: 'file1.tsv', signedURL: 'https://signed-url.com/file'},
                    {fileName: 'file2.tsv', signedURL: 'https://signed-url.com/file'}
                ]
            });

            const result = await batchService.createBatch(params, mockSubmission, mockUser);

            expect(mockBatchDAO.getNextDisplayID).toHaveBeenCalledWith('sub1');
            expect(mockS3Service.createPreSignedURL).toHaveBeenCalledTimes(2);
            expect(mockBatchDAO.create).toHaveBeenCalled();
            expect(result.type).toBe('metadata');
            expect(result.files).toHaveLength(2);
        });

        it('should create data file batch successfully', async () => {
            const params = {
                submissionID: 'sub1',
                type: 'DATA_FILE',
                files: ['data1.txt', 'data2.txt']
            };

            mockBatchDAO.getNextDisplayID.mockResolvedValue(2);
            mockBatchDAO.create.mockResolvedValue({
                _id: 'batch2',
                displayID: 2,
                type: 'data file',
                files: [
                    {fileName: 'data1.txt', url: 'https://api.example.com/data1.txt'},
                    {fileName: 'data2.txt', url: 'https://api.example.com/data2.txt'}
                ]
            });

            const result = await batchService.createBatch(params, mockSubmission, mockUser);

            expect(mockBatchDAO.getNextDisplayID).toHaveBeenCalledWith('sub1');
            expect(mockFetchDataModelInfo).toHaveBeenCalled();
            expect(mockBatchDAO.create).toHaveBeenCalled();
            expect(result.type).toBe('data file');
            expect(result.files).toHaveLength(2);
        });

        it('should throw error when batch creation fails', async () => {
            const params = {
                submissionID: 'sub1',
                type: 'METADATA',
                files: ['file1.tsv']
            };

            mockBatchDAO.getNextDisplayID.mockResolvedValue(1);
            mockS3Service.createPreSignedURL.mockResolvedValue('https://signed-url.com/file');
            mockBatchDAO.create.mockResolvedValue(null);

            await expect(batchService.createBatch(params, mockSubmission, mockUser))
                .rejects
                .toThrow(ERROR.FAILED_NEW_BATCH_INSERTION);
        });

        it('should throw error when root path is missing', async () => {
            const params = {
                submissionID: 'sub1',
                type: 'METADATA',
                files: ['file1.tsv']
            };

            const submissionWithoutRootPath = {...mockSubmission, rootPath: ''};

            await expect(batchService.createBatch(params, submissionWithoutRootPath, mockUser))
                .rejects
                .toThrow(ERROR.FAILED_NEW_BATCH_NO_ROOT_PATH);
        });
    });

    describe('updateBatch', () => {
        const mockBatch = {
            _id: 'batch1',
            submissionID: 'sub1',
            type: 'metadata',
            filePrefix: 'test/root/metadata',
            bucketName: 'test-bucket',
            files: [
                {fileName: 'file1.tsv', status: 'Pending'},
                {fileName: 'file2.tsv', status: 'Pending'}
            ],
            status: 'Pending',
            errors: ["someError"]
        };

        const mockFiles = [
            {fileName: 'file1.tsv', succeeded: true, errors: []},
            {fileName: 'file2.tsv', succeeded: true, errors: []}
        ];

        it('should update batch successfully when all files uploaded', async () => {
            mockS3Service.listFileInDir.mockResolvedValue([
                {Key: 'test/root/metadata/file1.tsv'},
                {Key: 'test/root/metadata/file2.tsv'}
            ]);
            mockBatchDAO.update.mockResolvedValue({_id: 'batch1', status: 'Uploading'});
            mockBatchDAO.findById.mockResolvedValue({
                ...mockBatch,
                status: 'Uploading',
                files: [
                    {fileName: 'file1.tsv', status: 'Uploaded'},
                    {fileName: 'file2.tsv', status: 'Uploaded'}
                ]
            });

            const result = await batchService.updateBatch(mockBatch, 'test-bucket', mockFiles);

            expect(mockS3Service.listFileInDir).toHaveBeenCalledWith('test-bucket', 'test/root/metadata');
            expect(mockBatchDAO.update).toHaveBeenCalled();
            expect(mockAwsService.sendSQSMessage).toHaveBeenCalledWith(
                {type: 'Load Metadata', batchID: 'batch1'},
                'sub1',
                'batch1',
                'test-queue'
            );
            expect(result.status).toBe('Uploading');
        });

        it('should mark batch as failed when files not uploaded', async () => {
            mockS3Service.listFileInDir.mockResolvedValue([
                {Key: 'test/root/metadata/file1.tsv'}
            ]);
            mockBatchDAO.update.mockResolvedValue({_id: 'batch1', status: 'Failed'});
            mockBatchDAO.findById.mockResolvedValue({
                ...mockBatch,
                status: 'Failed',
                files: [
                    {fileName: 'file1.tsv', status: 'Uploaded'},
                    {fileName: 'file2.tsv', status: 'Failed', errors: ['File not found']}
                ]
            });

            const result = await batchService.updateBatch(mockBatch, 'test-bucket', mockFiles);

            expect(result.status).toBe('Failed');
            expect(mockAwsService.sendSQSMessage).not.toHaveBeenCalled();
        });

        it('should handle skipped files correctly', async () => {
            const filesWithSkipped = [
                {fileName: 'file1.tsv', succeeded: true, skipped: true},
                {fileName: 'file2.tsv', succeeded: true, skipped: true}
            ];

            mockBatchDAO.update.mockResolvedValue({_id: 'batch1', status: 'Uploaded'});
            mockBatchDAO.findById.mockResolvedValue({
                ...mockBatch,
                status: 'Uploaded',
                files: [],
                fileCount: 0
            });

            const result = await batchService.updateBatch(mockBatch, 'test-bucket', filesWithSkipped);

            expect(result.status).toBe('Uploaded');
            expect(result.files).toHaveLength(0);
        });

        it('should throw error when batch update fails', async () => {
            mockS3Service.listFileInDir.mockResolvedValue([
                {Key: 'test/root/metadata/file1.tsv'}
            ]);
            mockBatchDAO.update.mockResolvedValue(null);

            await expect(batchService.updateBatch(mockBatch, 'test-bucket', mockFiles))
                .rejects
                .toThrow(ERROR.FAILED_BATCH_UPDATE);
        });
    });

    describe('listBatches', () => {
        it('should return batches with pagination', async () => {
            const params = {
                submissionID: 'sub1',
                first: 10,
                offset: 0,
                orderBy: 'createdAt',
                sortDirection: 'desc'
            };

            const mockBatches = [
                {_id: 'batch1', displayID: 1, type: 'metadata'},
                {_id: 'batch2', displayID: 2, type: 'data file'}
            ];

            mockBatchDAO.findMany.mockResolvedValue(mockBatches);
            mockBatchDAO.count.mockResolvedValue(2);

            const result = await batchService.listBatches(params);

            expect(mockBatchDAO.findMany).toHaveBeenCalled();
            expect(mockBatchDAO.count).toHaveBeenCalled();
            expect(result.batches).toEqual(mockBatches);
            expect(result.total).toBe(2);
        });

        it('should return empty result when no batches found', async () => {
            const params = {
                submissionID: 'sub1'
            };

            mockBatchDAO.findMany.mockResolvedValue([]);
            mockBatchDAO.count.mockResolvedValue(0);

            const result = await batchService.listBatches(params);

            expect(result.batches).toEqual([]);
            expect(result.total).toBe(0);
        });
    });

    describe('getMetadataFile', () => {
        const mockSubmission = {
            name: 'Test Submission'
        };

        const mockBatch = {
            _id: 'batch1',
            displayID: 1,
            bucketName: 'test-bucket',
            filePrefix: 'test/root/metadata',
            files: [
                {fileName: 'file1.tsv', status: 'Uploaded'},
                {fileName: 'file2.tsv', status: 'Uploaded'}
            ],
            zipFileName: ''
        };

        it('should return download URL for specific file', async () => {
            const fileName = 'file1.tsv';
            mockS3Service.createDownloadSignedURL.mockResolvedValue('https://download-url.com/file');

            const result = await batchService.getMetadataFile(mockSubmission, mockBatch, fileName);

            expect(mockS3Service.createDownloadSignedURL).toHaveBeenCalledWith(
                'test-bucket',
                'test/root/metadata',
                'file1.tsv',
                'Test Submission_metadata_batch1file1.tsv'
            );
            expect(result).toBe('https://download-url.com/file');
        });

        it('should throw error when file not found', async () => {
            const fileName = 'nonexistent.tsv';

            await expect(batchService.getMetadataFile(mockSubmission, mockBatch, fileName))
                .rejects
                .toThrow(ERROR.FILE_NOT_EXIST);
        });

        it('should throw error when file not uploaded', async () => {
            const fileName = 'file1.tsv';
            const batchWithPendingFile = {
                ...mockBatch,
                files: [
                    {fileName: 'file1.tsv', status: 'Pending'}
                ]
            };

            await expect(batchService.getMetadataFile(mockSubmission, batchWithPendingFile, fileName))
                .rejects
                .toThrow(ERROR.FILE_NOT_EXIST);
        });

        it('should return existing zip file URL when zipFileName exists', async () => {
            const batchWithZip = {
                ...mockBatch,
                zipFileName: 'existing.zip'
            };

            mockS3Service.createDownloadSignedURL.mockResolvedValue('https://download-url.com/existing.zip');

            const result = await batchService.getMetadataFile(mockSubmission, batchWithZip);

            expect(mockS3Service.createDownloadSignedURL).toHaveBeenCalledWith(
                'test-bucket',
                'test/root/metadata',
                'existing.zip'
            );
            expect(result).toBe('https://download-url.com/existing.zip');
        });
    });
});