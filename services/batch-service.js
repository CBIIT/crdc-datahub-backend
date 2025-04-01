const {Batch} = require("../domain/batch");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const { UPLOADING_HEARTBEAT_CONFIG_TYPE } = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED, REJECTED, WITHDRAWN, VALIDATION, INTENTION} = require("../constants/submission-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {SUBMISSIONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {replaceErrorString} = require("../utility/string-util");
const {writeObject2JsonFile, readJsonFile2Object} = require("../utility/io-util");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const LOAD_METADATA = "Load Metadata";
const OMIT_DCF_PREFIX = 'omit-DCF-prefix';

class BatchService {
    constructor(s3Service, batchCollection, sqsLoaderQueue, awsService, prodURL, fetchDataModelInfo) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
        this.sqsLoaderQueue = sqsLoaderQueue;
        this.awsService = awsService;
        this.prodURL = prodURL;
        this.fetchDataModelInfo = fetchDataModelInfo;
    }

    async createBatch(params, aSubmission, user) {
        const prefix = createPrefix(params, aSubmission?.rootPath);
        const newDisplayID = await this.#getBatchDisplayID(params.submissionID);
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
        const inserted = await this.batchCollection.insert(newBatch);
        if (!inserted?.acknowledged) {
            console.error(ERROR.FAILED_NEW_BATCH_INSERTION);
            throw new Error(ERROR.FAILED_NEW_BATCH_INSERTION);
        }
        return newBatch;
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
                        aBatch.errors.push(replaceErrorString(ERROR.INVALID_UPLOAD_ATTEMPT, aFile.fileName));
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
                .filter(file => !s3UploadedFiles.has(file.fileName))
                .map(file => file.fileName);
            if (noUploadedFiles.length > 0) {
                aBatch.errors = aBatch.errors || [];
                aBatch.errors.push(replaceErrorString(ERROR.NO_UPLOADED_FILES, `'${noUploadedFiles.join(", ")}'`));
                aBatch.status = BATCH.STATUSES.FAILED;
            }

            for (const aFileName of uploadFiles?.keys()) {
                const file = uploadFiles.get(aFileName);
                // File already uploaded, but it marked the file as failed.
                if (!isTrue(file?.succeeded) && s3UploadedFiles.has(aFileName)) {
                    aBatch.errors = aBatch.errors || [];
                    aBatch.errors.push(replaceErrorString(ERROR.INVALID_UPLOAD_ATTEMPT, aFileName));
                    aBatch.status = BATCH.STATUSES.FAILED;
                }
            }
        }
        await asyncUpdateBatch(this.awsService, this.batchCollection, aBatch, this.sqsLoaderQueue, isAllUploaded, isAllSkipped);
        return await this.findByID(aBatch._id);
    }

    async listBatches(params, context) {
        let pipeline = listBatchConditions(context.userInfo._id, params?.collaboratorUserIDs, context.userInfo?.role, context.userInfo?.organization, params.submissionID, context.userInfo?.dataCommons);
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const noPaginationPipe = pipeline.concat(paginationPipe.getNoLimitPipeline());
        const promises = [
            await this.batchCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            await this.batchCollection.aggregate(noPaginationPipe.concat([{$count: "count"}]))
        ];
        return await Promise.all(promises).then(function(results) {
            const total = results[1]?.length > 0 ? results[1][0] : {};
            return {
                batches: (results[0] || []).map((batch)=>(batch)),
                total: total?.count || 0
            }
        });
    }
    
    async deleteBatchByFilter(filter) {
        return await this.batchCollection.deleteMany(filter);
    }

    async findByID(id) {
        const aBatch = await this.batchCollection.find(id);
        return (aBatch?.length > 0) ? aBatch[0] : null;
    }
    // private function
    async #getBatchDisplayID(submissionID) {
        const pipeline = [{$match: {submissionID}}, {$count: "total"}];
        const batches = await this.batchCollection.aggregate(pipeline);
        const totalDocs = batches.pop();
        return totalDocs?.total + 1 || 1;
    }
    /**
     * getLastFileBatchID
     * @param {*} submissionID 
     * @param {*} fileName 
     * @returns int
     */
    async getLastFileBatchID(submissionID, fileName){
        const pipeline = [
            {$match: {submissionID: submissionID, type: "data file", "files.fileName": fileName, status: "Uploaded"}},
            {$project: {
                _id: 0,
                batchID: "$displayID"
            }},
            {$sort: {displayID: -1}},
            {$limit: 1}
        ];
        const batches = await this.batchCollection.aggregate(pipeline);
        return (batches && batches.length > 0)? batches[0].batchID : null;
    }
}
const listBatchConditions = (userID, collaboratorUserIDs, userRole, aUserOrganization, submissionID, userDataCommonsNames) => {
    const submissionJoin = [
        {"$lookup": {
            from: SUBMISSIONS_COLLECTION,
            localField: "submissionID",
            foreignField: "_id",
            as: "batch"
        }},
        {"$unwind": {
            path: "$batch",
        }}
    ];

    const validStatusAndSubmissionID = {"submissionID": submissionID, "batch.status": {$in: [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED, REJECTED, WITHDRAWN]}};
    const listAllSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD];
    if (listAllSubmissionRoles.includes(userRole) || collaboratorUserIDs.length > 0) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID}}];
    }

    if (userRole === USER.ROLES.SUBMITTER || userRole === USER.ROLES.USER) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID, "batch.submitterID": userID}}];
    }

    if (userRole === USER.ROLES.DATA_COMMONS_PERSONNEL && userDataCommonsNames?.length > 0) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID, "batch.dataCommons": {$in: userDataCommonsNames}}}];
    }
    throw new Error(ERROR.INVALID_SUBMISSION_PERMISSION);
}

const asyncUpdateBatch = async (awsService, batchCollection, aBatch, sqsLoaderQueue, isAllUploaded, isAllSkipped) => {
    aBatch.updatedAt = getCurrentTime();
    const updated = await batchCollection.update(aBatch);
    if (!updated?.acknowledged){
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
    constructor(batchCollection, configurationService) {
        this.batchCollection = batchCollection;
        this.#initialize(configurationService);
    }

    /**
     * getInstance
     * @param {*} batchCollection 
     * @param {*} interval 
     * @returns UploadingChecker
     */
    static getInstance(batchCollection, configurationService) {
        if (!UploadingMonitor.instance) {
            UploadingMonitor.instance = new UploadingMonitor(batchCollection, configurationService);
        }
        return UploadingMonitor.instance;
    }

    /**
     * private function:  #initialize
     * @param {*} configurationService 
     */
    async #initialize(configurationService) {
        const config = await configurationService.findByType(UPLOADING_HEARTBEAT_CONFIG_TYPE);
        this.interval = (config?.interval || 300) * 1000; // 5 min
        this.max_age = (config?.age || 900) * 1000; // 15 min
        this.uploading_batch_pool = readJsonFile2Object(UPLOADING_BATCH_POOL_FILE);
        this.#startScheduler();
    }
    
    async #checkUploadingBatches() {
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
                    await this.setBatchStatus(batchID, BATCH.STATUSES.FAILED, error); 
                }
                catch (e) {
                    console.error(`Failed to update batch ${batchID} with error: ${e.message}`);
                }
                finally {
                    // remove failed batch from the pool
                    this.removeUploadingBatch(batchID);
                } 
            }
        }
    }

    // start a scheduler to monitor uploading batches every 5 min.
    #startScheduler() {
        setInterval(async () => {
            await this.#checkUploadingBatches();
        }, this.interval);
    }
    /**
     * saveUploadingBatch
     * @param {*} batchID 
     */
    saveUploadingBatch(batchID) {
        this.uploading_batch_pool[batchID] = new Date();
        this.#savePool2JsonFile();
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
        this.#savePool2JsonFile();
    }

    // persistent save the pool to json file
    #savePool2JsonFile() {
        try{writeObject2JsonFile(this.uploading_batch_pool, UPLOADING_BATCH_POOL_FILE)
        }
        catch (e) {
            console.error(`Failed to save uploading batch pool to ${UPLOADING_BATCH_POOL_FILE} with error: ${e.message}`)
        }
    }

    async setBatchStatus(batchID, status, error) {
        await this.batchCollection.update({"_id": batchID}, 
            {$set: {"status": status, "errors": [error],"updatedAt": new Date()}});
    }
} 

module.exports = {
    BatchService, UploadingMonitor
}