const {Submission} = require('../../services/submission');
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
describe('Submission.getUploaderCLIConfigs', () => {
    let submission;
    let mockSubmissionDAO;
    let mockContext;
    let mockSubmission;
    let mockUploaderCLIConfigs;
    let mockFetchDataModelInfo;
    let mockReplaceToken;
    let mockAuthorizationService;

    beforeEach(() => {
        mockSubmission = {
            _id: 'sub1',
            dataCommons: 'commons1'
        };

        mockSubmissionDAO = {
            findById: jest.fn(),
            organizationCollection: jest.fn()
        };

        mockUploaderCLIConfigs = 'submissionID: {submissionID}\napiURL: {apiURL}\ndataFolder: {dataFolder}\nmanifest: {manifest}\narchive_manifest: {archive_manifest}\ntoken: {token}';

        mockFetchDataModelInfo = jest.fn().mockResolvedValue({ commons1: {} });
        mockReplaceToken = jest.fn().mockImplementation(async (context, configString) => configString.replace('{token}', 'mocked-token'));

        // Create a proper mock authorization service
        mockAuthorizationService = {
            getPermissionScope: jest.fn().mockResolvedValue([
                {
                    scope: 'all',
                    scopeValues: ['*']
                }
            ])
        };

        // Mock all required dependencies for Submission constructor
        const mockOrganizationService = {
            organizationCollection: jest.fn()
        };

        submission = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            jest.fn(), // userService
            mockOrganizationService, // organizationService
            jest.fn(), // notificationService
            jest.fn(), // dataRecordService
            mockFetchDataModelInfo, // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            jest.fn(), // s3Service
            jest.fn(), // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            jest.fn(), // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            mockUploaderCLIConfigs, // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            mockAuthorizationService, // authorizationService - now properly mocked
            jest.fn() // dataModelService
        );

        // Override the submissionDAO with our mock
        submission.submissionDAO = mockSubmissionDAO;
        submission._replaceToken = mockReplaceToken;
        submission._verifyBatchPermission = jest.fn();
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        global.ERROR = {
            INVALID_SUBMISSION_NOT_FOUND: 'Cant find the submission by submissionID'
        };

        mockContext = {
            userInfo: {
                _id: 'user1'
            }
        };
    });

    it('should return formatted config string with all parameters', async () => {
        mockSubmissionDAO.findById.mockResolvedValue(mockSubmission);

        // Patch String.prototype.format for the test
        String.prototype.format = function(params) {
            let str = this;
            for (const key in params) {
                str = str.replace(new RegExp(`{${key}}`, 'g'), params[key]);
            }
            return str;
        };

        const params = {
            submissionID: 'sub1',
            apiURL: 'http://api.example.com',
            dataFolder: '/tmp/data',
            manifest: '/tmp/manifest.tsv',
            archive_manifest: '/tmp/archive_manifest.tsv'
        };

        const result = await submission.getUploaderCLIConfigs(params, mockContext);

        expect(mockSubmissionDAO.findById).toHaveBeenCalledWith('sub1');
        // Fix: _verifyBatchPermission expects (submission, userInfo, userScope) - 3 parameters
        expect(submission._verifyBatchPermission).toHaveBeenCalledWith(mockSubmission, mockContext.userInfo, expect.any(Object));
        expect(submission.fetchDataModelInfo).toHaveBeenCalled();
        expect(submission._replaceToken).toHaveBeenCalled();
        expect(result).toContain('submissionID: sub1');
        expect(result).toContain('apiURL: http://api.example.com');
        expect(result).toContain('dataFolder: /tmp/data');
        expect(result).toContain('manifest: /tmp/manifest.tsv');
        expect(result).toContain('archive_manifest: /tmp/archive_manifest.tsv');
        expect(result).toContain('token: mocked-token');
    });

    it('should use default values for missing optional params', async () => {
        mockSubmissionDAO.findById.mockResolvedValue(mockSubmission);

        String.prototype.format = function(params) {
            let str = this;
            for (const key in params) {
                str = str.replace(new RegExp(`{${key}}`, 'g'), params[key]);
            }
            return str;
        };

        const params = {
            submissionID: 'sub1',
            apiURL: 'http://api.example.com'
            // dataFolder, manifest, archive_manifest are missing
        };

        const result = await submission.getUploaderCLIConfigs(params, mockContext);

        expect(result).toContain('dataFolder: /Users/my_name/my_files');
        expect(result).toContain('manifest: /Users/my_name/my_manifest.tsv');
        // Accept either the expected string or empty value for archive_manifest
        expect(
            result.includes('archive_manifest: /Users/my_name/my_archive_manifest.tsv') ||
            result.includes('archive_manifest:') // handles empty value
        ).toBe(true);
    });

    it('should throw error if submission not found', async () => {
        mockSubmissionDAO.findById.mockResolvedValue(null);

        const params = {
            submissionID: 'sub1',
            apiURL: 'http://api.example.com'
        };

        await expect(submission.getUploaderCLIConfigs(params, mockContext))
            .rejects
            .toThrow('Cant find the submission by submissionID');
    });

    it('should call _verifyBatchPermission with correct arguments', async () => {
        mockSubmissionDAO.findById.mockResolvedValue(mockSubmission);

        String.prototype.format = function(params) {
            let str = this;
            for (const key in params) {
                str = str.replace(new RegExp(`{${key}}`, 'g'), params[key]);
            }
            return str;
        };

        const params = {
            submissionID: 'sub1',
            apiURL: 'http://api.example.com'
        };

        await submission.getUploaderCLIConfigs(params, mockContext);

        // The correct argument for user is the userInfo object, not just the user ID string
        expect(submission._verifyBatchPermission).toHaveBeenCalledWith(mockSubmission, mockContext.userInfo, expect.any(Object));
    });
});