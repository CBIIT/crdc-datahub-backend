const {BatchService} = require("../../services/batch-service");
const {BATCH} = require("../../crdc-datahub-database-drivers/constants/batch-constants");
const {Batch} = require("../../domain/batch");
const ERROR = require("../../constants/error-constants");
const mockS3Service = {
    createPreSignedURL: jest.fn()
};

const mockBatchCollection = {
    insert: jest.fn()
};

describe('BatchService', () => {
    describe('createBatch', () => {
        test('should create a new batch with metadata', async () => {
            // Arrange
            const batchService = new BatchService(mockS3Service, mockBatchCollection, 'testBucket');
            const params = {
                submissionID: 'submission123',
                type: BATCH.TYPE.METADATA,
                files: [
                    { fileName: 'file1.txt' },
                    { fileName: 'file2.txt' },
                ],
            };
            const context = {
                userInfo: {
                    organization: { orgID: 'org123' },
                },
            };

            const mockInsertResult = {
                acknowledged: true
            };

            mockS3Service.createPreSignedURL.mockReturnValue('signed-url');
            mockBatchCollection.insert.mockReturnValue(mockInsertResult);

            const result = await batchService.createBatch(params, context);
            expect(result).toBeInstanceOf(Batch);
            expect(mockS3Service.createPreSignedURL).toHaveBeenCalledTimes(2);
            expect(mockBatchCollection.insert).toHaveBeenCalledWith(expect.any(Batch));
        });

        test('should throw an error if batch insertion fails', async () => {
            const batchService = new BatchService(mockS3Service, mockBatchCollection, 'testBucket');
            const params = {
                submissionID: 'submission123',
                type: BATCH.TYPE.METADATA,
                files: [
                    { fileName: 'file1.txt' },
                    { fileName: 'file2.txt' },
                ],
            };
            const context = {
                userInfo: {
                    organization: { orgID: 'org123' },
                },
            };

            const mockInsertResult = {
                acknowledged: false
            };

            mockS3Service.createPreSignedURL.mockReturnValue('signed-url');
            mockBatchCollection.insert.mockReturnValue(mockInsertResult);
            await expect(batchService.createBatch(params, context)).rejects.toThrow(ERROR.FAILED_NEW_BATCH_INSERTION);
        });
    });
});