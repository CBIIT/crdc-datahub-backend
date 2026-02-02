const {Batch} = require("../domain/batch");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const { UPLOADING_HEARTBEAT_CONFIG_TYPE, VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {replaceErrorString} = require("../utility/string-util");
const {writeObject2JsonFile, readJsonFile2Object} = require("../utility/io-util");
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const fs = require('fs');
const path = require('path');
const {makeDir, zipFilesInDir} = require("../utility/io-util");
const BatchDAO = require("../dao/batch");
const {PrismaPagination} = require("../crdc-datahub-database-drivers/domain/prisma-pagination");

const LOAD_METADATA = "Load Metadata";
const OMIT_DCF_PREFIX = 'omit-DCF-prefix';
const ID = "id";
class BatchService {
    constructor(s3Service, sqsLoaderQueue, awsService, prodURL, fetchDataModelInfo) {
        this.s3Service = s3Service;
        this.sqsLoaderQueue = sqsLoaderQueue;
        this.awsService = awsService;
        this.prodURL = prodURL;
        this.fetchDataModelInfo = fetchDataModelInfo;
        this.batchDAO = new BatchDAO();
    }

    async createBatch(params, aSubmission, user) {
        const prefix = createPrefix(params, aSubmission?.rootPath);
        const newDisplayID = await this._getBatchDisplayID(params.submissionID);
        const newBatch = Batch.createNewBatch(params.submissionID, newDisplayID, aSubmission?.bucketName, prefix, params.type.toLowerCase(), user._id, user.firstName + " " + user.lastName);
        if (BATCH.TYPE.METADATA === params.type.toLowerCase()) {
            await Promise.all(params.files.map(async (fileName) => {
                if (fileName) {
                    const signedURL = await this.s3Service.createPreSignedURL(aSubmission?.bucketName, newBatch.filePrefix, fileName);
                    newBatch.addMetadataFile(fileName, signedURL);
                }
            }));
        } else {
            // The prefix "dg.4DFC" added if "omit-dcf-prefix" is null or set to false in the data model
            const dataModelInfo = await this.fetchDataModelInfo();
            const isOmitPrefix = isTrue(dataModelInfo?.[aSubmission?.dataCommons]?.[OMIT_DCF_PREFIX]);
            params.files.forEach((fileName) => {
                if (fileName) {
                    newBatch.addDataFile(fileName, this.prodURL, aSubmission?.studyID, isOmitPrefix);
                }
            });
        }

        const inserted = await this.batchDAO.create(newBatch);
        if (!inserted) {
            console.error(ERROR.FAILED_NEW_BATCH_INSERTION);
            throw new Error(ERROR.FAILED_NEW_BATCH_INSERTION);
        }
        return inserted;
    }

    async findOneBatchByStatus(submissionID, status) {
        return await this.batchDAO.findByStatus(submissionID, status);
    }

    async updateBatch(aBatch, bucketName, files) {
        const uploadFiles = new Map(files
            .filter(aFile => (aFile?.fileName) && aFile?.fileName.trim().length > 0)
            .map(file => [file?.fileName, file]));
        const succeededFiles = [];
        const skippedFiles = files.filter(f=>f.skipped === true);
        const skippedCount = skippedFiles.length
        const isAllSkipped = skippedCount === files.length;

        const s3Files = await this.s3Service.listFileInDir(bucketName, aBatch?.filePrefix);
        const s3UploadedFiles = new Set(s3Files
            ?.map((f)=> f.Key?.replace(`${aBatch?.filePrefix}/`, ""))
            .filter((f)=>f !== ""));
        if (!isAllSkipped) {
            let updatedFiles = [];
            for (const aFile of aBatch.files) {
                const aUploadFile = uploadFiles.get(aFile.fileName);
                if(isTrue(aUploadFile?.skipped)){
                    continue;
                }
                aFile.updatedAt = getCurrentTime();
                if (aUploadFile?.succeeded && s3UploadedFiles.has(aFile.fileName)) {
                    aFile.status = FILE.UPLOAD_STATUSES.UPLOADED;
                    succeededFiles.push(aFile);
                } else {
                    aFile.status = FILE.UPLOAD_STATUSES.FAILED;
                    aFile.errors = aUploadFile?.errors || [];
                    const invalidUploadAttempt = aUploadFile?.succeeded && !s3UploadedFiles.has(aFile.fileName) || !aUploadFile?.succeeded && s3UploadedFiles.has(aFile.fileName);
                    if (invalidUploadAttempt) {
                        aBatch.errors = aBatch?.errors || [];
                        const invalidUploadError = replaceErrorString(ERROR.INVALID_UPLOAD_ATTEMPT, aFile.fileName);
                        aBatch.errors.push(invalidUploadError);
                    }
                }
                updatedFiles.push(aFile)
            }
            aBatch.files = updatedFiles;
            aBatch.fileCount = updatedFiles.length;
        }
        else {
            aBatch.files = [];
            aBatch.fileCount = 0;
        }

        // Count how many batch files updated from FE match the uploaded files.
        const isAllUploaded = files?.length > 0 && (succeededFiles.length + skippedCount  === files?.length);
        aBatch.status = isAllUploaded ? (aBatch.type=== BATCH.TYPE.METADATA && !isAllSkipped? BATCH.STATUSES.UPLOADING : BATCH.STATUSES.UPLOADED) : BATCH.STATUSES.FAILED;
        // Store error files that were not uploaded to the S3 bucket
        if (aBatch.status !== BATCH.STATUSES.UPLOADING) {
            const noUploadedFiles = files
                .filter(file => !s3UploadedFiles.has(file.fileName) && isTrue(file.succeeded))
                .map(file => file.fileName);
            if (noUploadedFiles.length > 0) {
                aBatch.errors = aBatch.errors || [];
                aBatch.errors.push(replaceErrorString(ERROR.NO_UPLOADED_FILES, `'${noUploadedFiles.join(", ")}'`));
                aBatch.status = BATCH.STATUSES.FAILED;
            }

            for (const aFileName of uploadFiles?.keys()) {
                const file = uploadFiles.get(aFileName);
                // File already uploaded, but it marked the file as failed.
                const invalidUploadError = replaceErrorString(ERROR.INVALID_UPLOAD_ATTEMPT, aFileName);
                if (!isTrue(file?.succeeded) && s3UploadedFiles.has(aFileName)) {
                    aBatch.errors = aBatch.errors || [];
                    aBatch.errors.push(invalidUploadError);
                    aBatch.status = BATCH.STATUSES.FAILED;
                }
            }

            const batchErrorSet = new Set(aBatch.errors || []);
            const newErrors = files.flatMap(file => file.errors)
                .filter(error => error && !batchErrorSet.has(error));

            if (newErrors.length > 0) {
                aBatch.errors = aBatch.errors || [];
                aBatch.errors.push(...newErrors);
            }
            aBatch.errors = Array.from(new Set(aBatch.errors || []));
        }
        await asyncUpdateBatch(this.awsService, this.batchDAO, aBatch, this.sqsLoaderQueue, isAllUploaded, isAllSkipped);
        return await this.findByID(aBatch._id);
    }

    async listBatches(params) {
        const where = {submissionID: params.submissionID};
        const pagination = new PrismaPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const [batches, count] = await Promise.all([
            this.batchDAO.findMany(where, pagination.getPagination()),
            this.batchDAO.count(where)
        ]);

        return {
            batches: batches || [],
            total: count || 0
        };
    }

    async findByID(id) {
        return await this.batchDAO.findById(id);
    }
    // private function
    async _getBatchDisplayID(submissionID) {
        return (await this.batchDAO.getNextDisplayID(submissionID)) || 1;
    }
    /**
     * getLastFileBatchID
     * @param {*} submissionID
     * @param {*} fileName
     * @returns int
     */
    async getLastFileBatchID(submissionID, fileName){
        return await this.batchDAO.getLastFileBatchID(submissionID, fileName);
    }
    /**
     * getMetadataFile
     * @param {*} submission
     * @param {*} aBatch
     * @param {*} fileName
     * @returns string
     */
    async getMetadataFile(submission, aBatch, fileName) {
        const submissionName = submission.name.replace("/", "_");
        if(fileName){
            const file = aBatch?.files?.find(f=>f.fileName === fileName && f.status === FILE.UPLOAD_STATUSES.UPLOADED);
            if(!file){
                throw new Error(ERROR.FILE_NOT_EXIST);
            }
            const outputFilename = `${submissionName}_metadata_batch${aBatch.displayID}${fileName}`;
            return await this.s3Service.createDownloadSignedURL(aBatch?.bucketName, aBatch?.filePrefix, fileName, outputFilename) ;
        }
        // if no fileName, return all files in the batch as zip file
        let zipFileName = aBatch?.zipFileName;
        if(!zipFileName || zipFileName?.trim()?.length === 0){
            const tempFolder = `logs/${aBatch._id}`;
            const download_dir = path.join(tempFolder, "metadata_files");
            try{
                // create the temp folder if not existing
                [tempFolder, download_dir].forEach((dir) => {
                    makeDir(dir);
                });
                // download all metadata files to temp folder
                const downloadResults = await Promise.allSettled(aBatch.files.map(async (file) => {
                        // download file to temp folder from s3 with bucket, prefix, filename
                    const filePath = path.join(download_dir, file.fileName);
                    await this.s3Service.downloadFile(aBatch.bucketName, aBatch.filePrefix, file.fileName, filePath);
                }));
                // Check for any rejected promises
                const failedDownloads = downloadResults.filter(result => result.status === 'rejected');
                if (failedDownloads.length > 0) {
                    throw new Error(ERROR.NO_METADATA_FILES_DOWNLOADED);
                }
                //zip all downloaded files
                zipFileName = `${submissionName}_metadata_batch${aBatch.displayID}.zip`;
                const zipFilePath = path.join(tempFolder, zipFileName);
                await zipFilesInDir(download_dir, zipFilePath);
                //check if zip file already exists
                if (!fs.existsSync(zipFilePath)) {
                    throw new Error(ERROR.FAILED_TO_ZIP_METADATA_FILES);
                }
                //upload the zip file to s3 bucket based on batch.bucketName and batch.prefix
                await this.s3Service.uploadZipFile(aBatch.bucketName, aBatch.filePrefix, zipFileName, zipFilePath);

                //update aBatch with zipFileName if uploaded zip file without exception
                await this.batchDAO.update(aBatch._id, {"zipFileName": zipFileName, "updatedAt": getCurrentTime()})
            }
            finally{
                //delete the temp folder
                if (fs.existsSync(tempFolder)) {
                    fs.rmSync(tempFolder, { recursive: true, force: true });
                }
            }
        }
        //return presigned download url
        return await this.s3Service.createDownloadSignedURL(aBatch.bucketName, aBatch.filePrefix, zipFileName);
    }
}

const asyncUpdateBatch = async (awsService, batchDAO, aBatch, sqsLoaderQueue, isAllUploaded, isAllSkipped) => {
    aBatch.updatedAt = getCurrentTime();
    const updated = await batchDAO.update(aBatch._id, aBatch);
    if (!updated){
        const error = ERROR.FAILED_BATCH_UPDATE;
        console.error(error);
        throw new Error(error);
    }

    if (aBatch?.type === BATCH.TYPE.METADATA && isAllUploaded && !isAllSkipped && aBatch?.submissionID) {
        const message = { type: LOAD_METADATA, batchID: aBatch?._id };
        await awsService.sendSQSMessage(message, aBatch.submissionID, aBatch?._id, sqsLoaderQueue);
    }
}

const createPrefix = (params, rootPath) => {
    if (!rootPath || rootPath?.trim()?.length === 0) {
        throw new Error(ERROR.FAILED_NEW_BATCH_NO_ROOT_PATH);
    }
    const type = (VALIDATION.TYPES.DATA_FILE === params.type)? VALIDATION.TYPES.FILE : params.type ;
    const prefixArray = [rootPath, type];
    return prefixArray.join("/");
}

/**
 * UploadingMonitor: a singleton to hold uploading batch pool and scheduler to check the pool every 5 min.
 * public functions to save/remove {batchID: updatedAt} into/from the pool.
 * private function to monitor all uploading batches in the pool to check if updatedAT is older than 15 min,
 * if older than 15min, update the batch and set status to failed with errors.
*/
const UPLOADING_BATCH_POOL_FILE = "./logs/uploading_batch_pool.json";
class UploadingMonitor {
    static instance;
    constructor(batchDAO, configurationService) {
        this.batchDAO = batchDAO;
        this._initialize(configurationService);
    }

    /**
     * getInstance
     * @param {*} batchDAO
     * @param {*} configurationService
     * @returns UploadingChecker
     */
    static getInstance(batchDAO, configurationService) {
        if (!UploadingMonitor.instance) {
            UploadingMonitor.instance = new UploadingMonitor(batchDAO, configurationService);
        }
        return UploadingMonitor.instance;
    }

    /**
     * private function:  _initialize
     * @param {*} configurationService
     */
    async _initialize(configurationService) {
        const config = await configurationService.findByType(UPLOADING_HEARTBEAT_CONFIG_TYPE);
        this.interval = (config?.interval || 300) * 1000; // 5 min
        this.max_age = (config?.age || 900) * 1000; // 15 min
        this.uploading_batch_pool = readJsonFile2Object(UPLOADING_BATCH_POOL_FILE);
        // TODO move this scheduler to app.js
        this._startScheduler();
    }

    async _checkUploadingBatches() {
        if (Object.keys(this.uploading_batch_pool).length === 0) {
            return;
        }
        const now = new Date();
        // loop through all uploading batches in uploading_batch_pool
        // and check if updatedAt is older than 5*3 min. if older than 15 min, update batch with status failed.
        for (const batchID of Object.keys(this.uploading_batch_pool)) {
            const updatedAt = new Date(this.uploading_batch_pool[batchID]);
            const diff = now - updatedAt;
            if (diff > this.max_age) {
                //update batch with status failed if older than 15 min
                const error = ERROR.UPLOADING_BATCH_CRASHED;
                try {
                    await this.setUploadingFailed(batchID, BATCH.STATUSES.FAILED, error);
                }
                catch (e) {
                    console.error(`Failed to update batch ${batchID} with error: ${e.message}`);
                }
                finally {
                    // remove failed batch from the pool
                    // this.removeUploadingBatch(batchID);
                }
            }
        }
    }

    // start a scheduler to monitor uploading batches every 5 min.
    _startScheduler() {
        setInterval(async () => {
            await this._checkUploadingBatches();
    }, this.interval);
    }
    /**
     * saveUploadingBatch
     * @param {*} batchID
     */
    saveUploadingBatch(batchID) {
        this.uploading_batch_pool[batchID] = new Date();
        this._savePool2JsonFile();
    }

    /**
     * removeUploadingBatch
     * @param {*} batchID
     */
    removeUploadingBatch(batchID) {
         // check if the pool contains the batchID, if not, return
       if (!this.uploading_batch_pool[batchID]) {
            return;
        }
        delete this.uploading_batch_pool[batchID];
        this._savePool2JsonFile();
    }

    // persistent save the pool to json file
    _savePool2JsonFile() {
        try{writeObject2JsonFile(this.uploading_batch_pool, UPLOADING_BATCH_POOL_FILE)
        }
        catch (e) {
            console.error(`Failed to save uploading batch pool to ${UPLOADING_BATCH_POOL_FILE} with error: ${e.message}`)
        }
    }

    async setUploadingFailed(batchID, status, error, throwable = false) {
        try {
            const response = await this.batchDAO.update(batchID, {
                status: status, 
                errors: [error],
                updatedAt: new Date()
            });
            if (!response) {
                console.error(ERROR.FAILED_UPDATE_BATCH_STATUS);
                throw new Error(ERROR.FAILED_UPDATE_BATCH_STATUS);
            }
        }
        catch (e) {
            console.error(`Failed to update batch ${batchID} with error: ${e.message}`);
            if (throwable) {
                throw e;
            }
        }
    }
}

module.exports = {
    BatchService, UploadingMonitor
}