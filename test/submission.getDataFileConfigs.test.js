const Submission = require('../services/submission');

describe('Submission.getDataFileConfigs', () => {
    let submissionInstance;
    let mockSubmissionCollection;
    let mockConfigurationService;
    let mockContext;
    let mockParams;
    let mockSubmission;
    let mockDataModel;
    let mockFileConfig;
    let mockUploadingHeartbeatConfig;

    beforeEach(() => {
        mockSubmission = {
            _id: 'sub1',
            dataCommons: 'commons1'
        };

        mockParams = { submissionID: 'sub1' };

        mockContext = {
            userInfo: { _id: 'user1' }
        };

        mockDataModel = {
            commons1: {
                DATA_MODEL_SEMANTICS: {
                    DATA_MODEL_FILE_NODES: {
                        fileNode: {
                            'id-field': 'file_id',
                            'name-field': 'file_name',
                            'size-field': 'file_size',
                            'md5-field': 'md5',
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
            "md5-field": "md5",
            "omit-DCF-prefix": true
        };

        mockUploadingHeartbeatConfig = { interval: 123 };

        mockSubmissionCollection = {
            findByID: jest.fn().mockResolvedValue(mockSubmission)
        };

        mockConfigurationService = {
            findByType: jest.fn().mockResolvedValue(mockUploadingHeartbeatConfig)
        };

        submissionInstance = new Submission();
        submissionInstance.submissionCollection = {
            findByID: jest.fn().mockResolvedValue(mockSubmission)
        };
        submissionInstance.configurationService = mockConfigurationService;

        // Mock dependencies
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));
        global.findByID = jest.fn().mockResolvedValue(mockSubmission);

        submissionInstance._verifyBatchPermission = jest.fn();
        submissionInstance.fetchDataModelInfo = jest.fn().mockResolvedValue(mockDataModel);
        submissionInstance._getModelFileNodeInfo = jest.fn().mockReturnValue(mockFileConfig);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return correct config object when all dependencies succeed', async () => {
        const result = await submissionInstance.getDataFileConfigs(mockParams, mockContext);
        expect(result).toEqual({
            id_field: "file_id",
            name_field: "file_name",
            size_field: "file_size",
            md5_field: "md5",
            omit_DCF_prefix: true,
            heartbeat_interval: 123
        });
        expect(submissionInstance._verifyBatchPermission).toHaveBeenCalledWith(mockSubmission, mockContext.userInfo._id);
        expect(submissionInstance.fetchDataModelInfo).toHaveBeenCalled();
        expect(submissionInstance._getModelFileNodeInfo).toHaveBeenCalledWith(mockSubmission, mockDataModel);
        expect(submissionInstance.configurationService.findByType).toHaveBeenCalled();
    });

    it('should throw if submission not found', async () => {
        submissionInstance.submissionCollection.findByID.mockResolvedValue(null);
        global.findByID.mockResolvedValue(null);
        await expect(submissionInstance.getDataFileConfigs(mockParams, mockContext))
            .rejects
            .toThrow();
    });

    it('should use default heartbeat_interval if config is missing', async () => {
        submissionInstance.configurationService.findByType.mockResolvedValue(null);
        const result = await submissionInstance.getDataFileConfigs(mockParams, mockContext);
        expect(result.heartbeat_interval).toBe(300);
    });

    it('should propagate error if _verifyBatchPermission throws', async () => {
        submissionInstance._verifyBatchPermission.mockImplementation(() => { throw new Error('No permission'); });
        await expect(submissionInstance.getDataFileConfigs(mockParams, mockContext))
            .rejects
            .toThrow('No permission');
    });

    it('should propagate error if fetchDataModelInfo throws', async () => {
        submissionInstance.fetchDataModelInfo.mockRejectedValue(new Error('fetch error'));
        await expect(submissionInstance.getDataFileConfigs(mockParams, mockContext))
            .rejects
            .toThrow('fetch error');
    });

    it('should propagate error if _getModelFileNodeInfo throws', async () => {
        submissionInstance._getModelFileNodeInfo.mockImplementation(() => { throw new Error('model error'); });
        await expect(submissionInstance.getDataFileConfigs(mockParams, mockContext))
            .rejects
            .toThrow('model error');
    });
});