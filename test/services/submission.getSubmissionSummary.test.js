const {Submission} = require('../../services/submission');

describe('Submission.getSubmissionSummary', () => {
    let submissionService;
    let mockContext;
    let mockParams;
    let mockSubmission;
    let mockUserScope;

    beforeEach(() => {
        // Mock organization service with organizationCollection
        const mockOrganizationService = {
            organizationCollection: {}
        };

        // Create submission service with required dependencies
        submissionService = new Submission(
            {}, // logCollection
            {}, // submissionCollection
            {}, // batchService
            {}, // userService
            mockOrganizationService, // organizationService
            {}, // notificationService
            { retrieveDSSummary: jest.fn() }, // dataRecordService
            jest.fn(), // fetchDataModelInfo
            {}, // awsService
            'test-queue', // metadataQueueName
            {}, // s3Service
            {}, // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            {}, // validationCollection
            'test-loader-queue', // sqsLoaderQueue
            {}, // qcResultsService
            {}, // uploaderCLIConfigs
            'test-bucket', // submissionBucketName
            {}, // configurationService
            {}, // uploadingMonitor
            new Map(), // dataCommonsBucketMap
            {}, // authorizationService
            {}, // dataModelService
            {} // dataRecordsCollection
        );

        // Mock dependencies
        submissionService._findByID = jest.fn();
        submissionService._getUserScope = jest.fn();

        mockContext = { userInfo: { _id: 'user1' } };
        mockParams = { submissionID: 'sub1' };
        mockSubmission = { _id: 'sub1', dataCommons: 'commons1' };
        mockUserScope = { isNoneScope: jest.fn() };

        // Mock verifySession
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        // Mock constants
        global.ERROR = {
            SUBMISSION_NOT_EXIST: 'The submission you are trying to access does not exist',
            VERIFY: { INVALID_PERMISSION: 'You do not have permission to perform this action.' }
        };
        global.USER_PERMISSION_CONSTANTS = {
            DATA_SUBMISSION: { VIEW: 'view' }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should throw if submission does not exist', async () => {
        submissionService._findByID.mockResolvedValue(null);

        await expect(submissionService.getSubmissionSummary(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.SUBMISSION_NOT_EXIST);

        expect(submissionService._findByID).toHaveBeenCalledWith('sub1');
    });

    it('should throw if user does not have permission', async () => {
        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserScope.isNoneScope.mockReturnValue(true);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);

        await expect(submissionService.getSubmissionSummary(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);

        expect(submissionService._findByID).toHaveBeenCalledWith('sub1');
        expect(submissionService._getUserScope).toHaveBeenCalled();
    });
});