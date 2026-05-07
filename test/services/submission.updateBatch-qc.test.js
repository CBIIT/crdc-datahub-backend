const { Submission } = require('../../services/submission');
const { VALIDATION, VALIDATION_STATUS } = require('../../constants/submission-constants');
const { BATCH, FILE } = require('../../crdc-datahub-database-drivers/constants/batch-constants');

jest.mock('../../verifier/batch-verifier', () => ({
    verifyBatch: jest.fn(() => ({
        isValidBatchID: jest.fn().mockReturnThis(),
        notEmpty: jest.fn().mockReturnThis(),
    })),
}));

describe('Submission.updateBatch — stale file QC cleanup', () => {
    let submissionService;
    let mockBatchService;
    let mockSubmissionDAO;
    let mockQcResultsService;
    let mockUploadingMonitor;

    const mockSubmission = {
        _id: 'sub-1',
        bucketName: 'bucket-1',
    };

    const mockContext = {
        userInfo: { _id: 'u1', role: 'Submitter' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBatchService = {
            findByID: jest.fn(),
            updateBatch: jest.fn(),
        };
        mockSubmissionDAO = {
            update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
        };
        mockQcResultsService = {
            deleteQCResultBySubmissionID: jest.fn().mockResolvedValue(undefined),
        };
        mockUploadingMonitor = {
            removeUploadingBatch: jest.fn(),
            saveUploadingBatch: jest.fn(),
        };

        submissionService = new Submission(
            {},
            {},
            mockBatchService,
            {},
            {},
            {},
            {},
            jest.fn(),
            {},
            'metadata-queue',
            {},
            {},
            [],
            [],
            {},
            'sqs-loader-queue',
            mockQcResultsService,
            {},
            'submission-bucket',
            {},
            mockUploadingMonitor,
            {},
            {},
            {},
            {}
        );
        submissionService.submissionDAO = mockSubmissionDAO;
        submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submissionService._getUserScope = jest.fn().mockResolvedValue({
            isNoneScope: () => false,
        });
        submissionService._verifyBatchPermission = jest.fn();
        submissionService._prepareUpdateData = (data) => ({ ...data, updatedAt: new Date() });
    });

    it('deletes file QC results for uploaded data file names when batch reaches Uploaded', async () => {
        mockBatchService.findByID.mockResolvedValue({
            _id: 'batch-1',
            submissionID: 'sub-1',
            status: BATCH.STATUSES.UPLOADING,
            type: VALIDATION.TYPES.DATA_FILE,
        });
        mockBatchService.updateBatch.mockResolvedValue({
            _id: 'batch-1',
            status: BATCH.STATUSES.UPLOADED,
            type: VALIDATION.TYPES.DATA_FILE,
            files: [
                { fileName: 'a.txt', status: FILE.UPLOAD_STATUSES.UPLOADED },
                { fileName: 'b.txt', status: FILE.UPLOAD_STATUSES.FAILED },
            ],
        });

        await submissionService.updateBatch(
            {
                batchID: 'batch-1',
                files: [
                    { fileName: 'a.txt', succeeded: true },
                    { fileName: 'b.txt', succeeded: false },
                ],
            },
            mockContext
        );

        expect(mockQcResultsService.deleteQCResultBySubmissionID).toHaveBeenCalledWith(
            'sub-1',
            VALIDATION.TYPES.DATA_FILE,
            ['a.txt'],
            false,
            []
        );
        expect(mockSubmissionDAO.update).toHaveBeenCalledWith(
            'sub-1',
            expect.objectContaining({ fileValidationStatus: VALIDATION_STATUS.NEW })
        );
    });

    it('does not delete QC when no files reached Uploaded status', async () => {
        mockBatchService.findByID.mockResolvedValue({
            _id: 'batch-1',
            submissionID: 'sub-1',
            status: BATCH.STATUSES.UPLOADING,
            type: VALIDATION.TYPES.DATA_FILE,
        });
        mockBatchService.updateBatch.mockResolvedValue({
            _id: 'batch-1',
            status: BATCH.STATUSES.UPLOADED,
            type: VALIDATION.TYPES.DATA_FILE,
            files: [{ fileName: 'a.txt', status: FILE.UPLOAD_STATUSES.FAILED }],
        });

        await submissionService.updateBatch(
            {
                batchID: 'batch-1',
                files: [{ fileName: 'a.txt', succeeded: false }],
            },
            mockContext
        );

        expect(mockQcResultsService.deleteQCResultBySubmissionID).not.toHaveBeenCalled();
        expect(mockSubmissionDAO.update).toHaveBeenCalled();
    });

    it('does not delete file QC when metadata batch reaches Uploaded', async () => {
        mockBatchService.findByID.mockResolvedValue({
            _id: 'batch-2',
            submissionID: 'sub-1',
            status: BATCH.STATUSES.UPLOADING,
            type: 'metadata',
        });
        mockBatchService.updateBatch.mockResolvedValue({
            _id: 'batch-2',
            status: BATCH.STATUSES.UPLOADING,
            type: 'metadata',
        });

        await submissionService.updateBatch(
            {
                batchID: 'batch-2',
                files: [{ fileName: 'm.tsv', succeeded: true }],
            },
            mockContext
        );

        expect(mockQcResultsService.deleteQCResultBySubmissionID).not.toHaveBeenCalled();
    });
});
