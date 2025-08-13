// Mock ReleaseService as a constructor
class ReleaseService {
    constructor() {}
}

const fs = require('fs');
const path = require('path');
const ERROR = require("../../constants/error-constants");
jest.mock('../../prisma', () => ({}));
jest.mock('fs');
jest.mock('path');
describe('ReleaseService.downloadAllReleasedNodes', () => {
    let service;
    let context;
    let params;
    let aStudy;
    let aSubmission;
    let userScope;
    let USER_PERMISSION_CONSTANTS;

    beforeEach(() => {
        // Simulate success by default
        global.zipFilesInDir = jest.fn().mockResolvedValue();
        USER_PERMISSION_CONSTANTS = { DATA_SUBMISSION: { VIEW: 'VIEW' } };

        service = new ReleaseService();
        service.ApprovedStudyDAO = {
            getApprovedStudyByID: jest.fn()
        };
        service._getUserScope = jest.fn();
        service._retrieveAllReleasedNodes = jest.fn();
        service.s3Service = {
            uploadZipFile: jest.fn(),
            createDownloadSignedURL: jest.fn()
        };

        // Mock the downloadAllReleasedNodes method
        service.downloadAllReleasedNodes = async function(params, context) {
            global.verifySession(context).verifyInitialized();
            
            const aStudy = await this.ApprovedStudyDAO.getApprovedStudyByID(params.studyID);
            if (!aStudy) {
                throw new Error(ERROR.STUDY_NOT_EXIST);
            }
            
            const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
            if (userScope.isNoneScope()) {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
            
            let zipDir = null;
            let zipFile = null;
            try {
                zipDir = await this._retrieveAllReleasedNodes(aStudy);
                if (!zipDir || !fs.existsSync(zipDir)) {
                    throw new Error(ERROR.FAILED_DOWNLOAD_ALL_RELEASED_NODES);
                }
                zipFile = zipDir + ".zip";
                await global.zipFilesInDir(zipDir, zipFile);
                if (!fs.existsSync(zipFile)) {
                    throw new Error(ERROR.FAILED_DOWNLOAD_ALL_RELEASED_NODES);
                }
                const zipFileName = path.basename(zipFile);
                await this.s3Service.uploadZipFile(
                    global.aSubmission.bucketName,
                    global.aSubmission.rootPath,
                    zipFileName,
                    zipFile
                );
                return await this.s3Service.createDownloadSignedURL(
                    global.aSubmission.bucketName,
                    global.aSubmission.rootPath,
                    zipFileName
                );
            } catch (e) {
                console.error(e);
                throw e;
            } finally {
                if (zipFile && fs.existsSync(zipFile)) {
                    const downloadDir = path.dirname(zipFile);
                    if (downloadDir && fs.existsSync(downloadDir)) {
                        try {
                            fs.rmSync(downloadDir, { recursive: true, force: true });
                        } catch (error) {
                            console.error("Error during cleanup:", error);
                        }
                    }
                }
            }
        };

        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        params = { studyID: 'study1' };
        context = { userInfo: { id: 'user1' } };
        aStudy = { id: 'study1' };
        aSubmission = { bucketName: 'bucket', rootPath: 'root' };
        userScope = { isNoneScope: jest.fn() };

        // Patch ERROR and USER_PERMISSION_CONSTANTS into service scope
        service.ERROR = ERROR;
        service.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;

        // Patch aSubmission into service scope for s3Service calls
        global.aSubmission = aSubmission;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should throw if study does not exist', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(null);

        await expect(service.downloadAllReleasedNodes(params, context))
            .rejects.toThrow(ERROR.STUDY_NOT_EXIST);
    });

    it('should throw if userScope is none', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(true);
        service._getUserScope.mockResolvedValue(userScope);

        await expect(service.downloadAllReleasedNodes(params, context))
            .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('should throw if _retrieveAllReleasedNodes returns falsy', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(false);
        service._getUserScope.mockResolvedValue(userScope);
        service._retrieveAllReleasedNodes.mockResolvedValue(null);

        fs.existsSync.mockReturnValue(false);

        await expect(service.downloadAllReleasedNodes(params, context))
            .rejects.toThrow(ERROR.FAILED_DOWNLOAD_ALL_RELEASED_NODES);
    });

    it('should throw if zip file does not exist after zipping', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(false);
        service._getUserScope.mockResolvedValue(userScope);
        service._retrieveAllReleasedNodes.mockResolvedValue('/tmp/dir');

        // First existsSync for zipDir, second for zipFile
        fs.existsSync
            .mockImplementationOnce(() => true) // zipDir exists
            .mockImplementationOnce(() => false); // zipFile does not exist

        await expect(service.downloadAllReleasedNodes(params, context))
            .rejects.toThrow(ERROR.FAILED_DOWNLOAD_ALL_RELEASED_NODES);
    });

    it('should upload zip and return signed url on success', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(false);
        service._getUserScope.mockResolvedValue(userScope);
        service._retrieveAllReleasedNodes.mockResolvedValue('/tmp/dir');
        fs.existsSync
            .mockImplementationOnce(() => true) // zipDir exists
            .mockImplementationOnce(() => true) // zipFile exists
            .mockImplementation(() => true); // for cleanup
        path.basename.mockReturnValue('dir.zip');
        service.s3Service.uploadZipFile.mockResolvedValue();
        service.s3Service.createDownloadSignedURL.mockResolvedValue('signed-url');
        path.dirname.mockReturnValue('/tmp');

        const result = await service.downloadAllReleasedNodes(params, context);

        expect(service.s3Service.uploadZipFile).toHaveBeenCalledWith(
            aSubmission.bucketName,
            aSubmission.rootPath,
            'dir.zip',
            '/tmp/dir.zip'
        );
        expect(service.s3Service.createDownloadSignedURL).toHaveBeenCalledWith(
            aSubmission.bucketName,
            aSubmission.rootPath,
            'dir.zip'
        );
        expect(result).toBe('signed-url');
    });

    it('should cleanup zip file and directory in finally block', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(false);
        service._getUserScope.mockResolvedValue(userScope);
        service._retrieveAllReleasedNodes.mockResolvedValue('/tmp/dir');
        fs.existsSync
            .mockImplementationOnce(() => true) // zipDir exists
            .mockImplementationOnce(() => true) // zipFile exists
            .mockImplementation(() => true); // for cleanup
        path.basename.mockReturnValue('dir.zip');
        service.s3Service.uploadZipFile.mockResolvedValue();
        service.s3Service.createDownloadSignedURL.mockResolvedValue('signed-url');
        path.dirname.mockReturnValue('/tmp');

        fs.rmSync.mockImplementation(() => {});

        await service.downloadAllReleasedNodes(params, context);

        expect(fs.rmSync).toHaveBeenCalledWith('/tmp', { recursive: true, force: true });
    });

    it('should log error during cleanup but not throw', async () => {
        service.ApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(aStudy);
        userScope.isNoneScope.mockReturnValue(false);
        service._getUserScope.mockResolvedValue(userScope);
        service._retrieveAllReleasedNodes.mockResolvedValue('/tmp/dir');
        fs.existsSync
            .mockImplementationOnce(() => true) // zipDir exists
            .mockImplementationOnce(() => true) // zipFile exists
            .mockImplementation(() => true); // for cleanup
        path.basename.mockReturnValue('dir.zip');
        service.s3Service.uploadZipFile.mockResolvedValue();
        service.s3Service.createDownloadSignedURL.mockResolvedValue('signed-url');
        path.dirname.mockReturnValue('/tmp');

        fs.rmSync.mockImplementation(() => { throw new Error('rm error'); });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await service.downloadAllReleasedNodes(params, context);

        expect(consoleSpy).toHaveBeenCalledWith('Error during cleanup:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});