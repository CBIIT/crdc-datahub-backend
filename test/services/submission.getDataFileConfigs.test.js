const { Submission } = require('../../services/submission');

describe('Submission.getDataFileConfigs', () => {
    let submission;
    let mockSubmissionDAO;
    let mockConfigurationService;
    let mockContext;
    let mockSubmission;
    let mockDataModelInfo;
    let mockFileConfig;
    let mockUploadingHeartbeatConfig;
    let params;
    let mockFetchDataModelInfo;
    let mockAuthorizationService;

    beforeEach(() => {
        params = { submissionID: 'sub123' };

        // Setup mocks
        mockSubmission = {
            _id: 'sub1',
            dataCommons: 'commons1',
        };

        mockDataModelInfo = {
            commons1: {
                DATA_MODEL_SEMANTICS: {
                    DATA_MODEL_FILE_NODES: {
                        fileNode: {
                            "id-field": "file_id",
                            "name-field": "file_name",
                            "size-field": "file_size",
                            "md5-field": "md5sum"
                        }
                    }
                },
                'omit-DCF-prefix': true
            }
        };

        mockFileConfig = {
            "id-field": "file_id",
            "name-field": "file_name",
            "size-field": "file_size",
            "md5-field": "md5sum",
            "omit-DCF-prefix": true
        };

        mockUploadingHeartbeatConfig = { interval: 123 };

        mockSubmissionDAO = {
            findById: jest.fn().mockResolvedValue(mockSubmission)
        };

        mockConfigurationService = {
            findByType: jest.fn().mockResolvedValue(mockUploadingHeartbeatConfig)
        };

        mockContext = {
            userInfo: { _id: 'user1' }
        };

        mockFetchDataModelInfo = jest.fn().mockResolvedValue(mockDataModelInfo);

        // Create a proper mock authorization service
        mockAuthorizationService = {
            getPermissionScope: jest.fn().mockResolvedValue([
                {
                    scope: 'all',
                    scopeValues: ['*']
                }
            ])
        };

        // Initialize Submission with required dependencies
        // Provide a mock organizationService with an organizationCollection as required by Submission
        const mockOrganizationService = { organizationCollection: {} };

        submission = new Submission(
            null, // logCollection
            null, // submissionCollection
            null, // batchService
            null, // userService
            mockOrganizationService, // organizationService with organizationCollection
            null, // notificationService
            null, // dataRecordService
            mockFetchDataModelInfo, // fetchDataModelInfo
            null, // awsService
            null, // metadataQueueName
            null, // s3Service
            null, // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            null, // validationCollection
            null, // sqsLoaderQueue
            null, // qcResultsService
            null, // uploaderCLIConfigs
            null, // submissionBucketName
            mockConfigurationService, // configurationService
            null, // uploadingMonitor
            null, // dataCommonsBucketMap
            mockAuthorizationService  // authorizationService - now properly mocked
        );

        submission.submissionDAO = mockSubmissionDAO;
        submission._getModelFileNodeInfo = jest.fn().mockReturnValue(mockFileConfig);
        submission._verifyBatchPermission = jest.fn().mockResolvedValue();

        if (!global.verifySession) {
            global.verifySession = jest.fn(() => ({ verifyInitialized: jest.fn() }));
        }
        if (!global.ERROR) {
            global.ERROR = { 
                INVALID_SUBMISSION_NOT_FOUND: "Cant find the submission by submissionID",
                VERIFY: {
                    INVALID_PERMISSION: "You do not have permission to perform this action."
                }
            };
        }
        global.UPLOADING_HEARTBEAT_CONFIG_TYPE = 'heartbeat';
    });

    it('should throw error if submission not found', async () => {
        mockSubmissionDAO.findById.mockResolvedValue(null);
        await expect(submission.getDataFileConfigs(params, mockContext))
            .rejects
            .toThrow("Cant find the submission by submissionID");
    });

    it('should return config object with default heartbeat_interval if config not found', async () => {
        const aSubmission = { _id: params.submissionID, dataCommons: 'commonsA' };
        const fileConfig = {
            "id-field": "file_id",
            "name-field": "file_name",
            "size-field": "file_size",
            "md5-field": "md5sum",
            "omit-DCF-prefix": false
        };
        mockSubmissionDAO.findById.mockResolvedValue(aSubmission);
        mockFetchDataModelInfo.mockResolvedValue({}); // not used in this test
        submission._getModelFileNodeInfo.mockReturnValue(fileConfig);
        mockConfigurationService.findByType.mockResolvedValue(null);

        const result = await submission.getDataFileConfigs(params, mockContext);

        expect(result).toEqual({
            id_field: "file_id",
            name_field: "file_name",
            size_field: "file_size",
            md5_field: "md5sum",
            omit_DCF_prefix: false,
            heartbeat_interval: 300
        });
    });

    it('should return config object with heartbeat_interval from config', async () => {
        const aSubmission = { _id: params.submissionID, dataCommons: 'commonsA' };
        const fileConfig = {
            "id-field": "file_id",
            "name-field": "file_name",
            "size-field": "file_size",
            "md5-field": "md5sum",
            "omit-DCF-prefix": true
        };
        mockSubmissionDAO.findById.mockResolvedValue(aSubmission);
        mockFetchDataModelInfo.mockResolvedValue({});
        submission._getModelFileNodeInfo.mockReturnValue(fileConfig);
        mockConfigurationService.findByType.mockResolvedValue({ interval: 123 });

        const result = await submission.getDataFileConfigs(params, mockContext);

        expect(result).toEqual({
            id_field: "file_id",
            name_field: "file_name",
            size_field: "file_size",
            md5_field: "md5sum",
            omit_DCF_prefix: true,
            heartbeat_interval: 123
        });
    });

    it('should call fetchDataModelInfo and getModelFileNodeInfo with correct arguments', async () => {
        const aSubmission = { _id: params.submissionID, dataCommons: 'commonsA' };
        const latestDataModel = { foo: 'bar' };
        const fileConfig = {
            "id-field": "file_id",
            "name-field": "file_name",
            "size-field": "file_size",
            "md5-field": "md5sum",
            "omit-DCF-prefix": false
        };
        mockSubmissionDAO.findById.mockResolvedValue(aSubmission);
        mockFetchDataModelInfo.mockResolvedValue(latestDataModel);
        submission._getModelFileNodeInfo.mockReturnValue(fileConfig);
        mockConfigurationService.findByType.mockResolvedValue({ interval: 456 });

        await submission.getDataFileConfigs(params, mockContext);

        expect(mockFetchDataModelInfo).toHaveBeenCalled();
        expect(submission._getModelFileNodeInfo).toHaveBeenCalledWith(aSubmission, latestDataModel);
    });
});