const {Batch} = require("../domain/batch");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
const {NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED, REJECTED, WITHDRAWN, VALIDATION, INTENTION} = require("../constants/submission-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {SUBMISSIONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {replaceErrorString} = require("../utility/string-util");
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
            await Promise.all(params.files.map(async (file) => {
                if (file.fileName) {
                    const signedURL = await this.s3Service.createPreSignedURL(aSubmission?.bucketName, newBatch.filePrefix, file.fileName);
                    newBatch.addMetadataFile(file.fileName, file.size, signedURL);
                }
            }));
        } else {
            // The prefix "dg.4DFC" added if "omit-dcf-prefix" is null or set to false in the data model
            const dataModelInfo = await this.fetchDataModelInfo();
            const isOmitPrefix = Boolean(dataModelInfo?.[aSubmission?.dataCommons]?.[OMIT_DCF_PREFIX]);
            params.files.forEach((file) => {
                if (file.fileName) {
                    newBatch.addDataFile(file.fileName, file.size, this.prodURL, aSubmission?.studyID, isOmitPrefix);
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

        if (!isAllSkipped) {
            let updatedFiles = [];
            for (const aFile of aBatch.files) {
                if (!uploadFiles.has(aFile.fileName)) {
                    continue;
                }
                const aUploadFile = uploadFiles.get(aFile.fileName);
                if( aUploadFile.skipped === true){
                    continue;
                }
                aFile.updatedAt = getCurrentTime();
                if (aUploadFile?.succeeded) {
                    aFile.status = FILE.UPLOAD_STATUSES.UPLOADED;
                    succeededFiles.push(aFile);
                }
                else {
                    aFile.status = FILE.UPLOAD_STATUSES.FAILED;
                    aFile.errors = aUploadFile?.errors || [];
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
            const s3Files = await this.s3Service.listFileInDir(bucketName, aBatch?.filePrefix);
            const s3UploadedFiles = new Set(s3Files
                ?.map((f)=> f.Key?.replace(`${aBatch?.filePrefix}/`, "")));

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
                if (!Boolean(file?.succeeded) && s3UploadedFiles.has(aFileName)) {
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
        const pagination = [
            {"$sort": { [params.orderBy]: getSortDirection(params.sortDirection)}}, // default by displayID & Desc
            {"$skip": params.offset},
            // disable pagination if fist === -1
            ...(params.first === -1 ? [] : [{"$limit": params.first}])
        ];
        const promises = [
            await this.batchCollection.aggregate(pipeline.concat(pagination)),
            await this.batchCollection.aggregate(pipeline.concat([{$count: "count"}]))
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
    const listAllSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD, USER.ROLES.CURATOR, USER.ROLES.FEDERAL_MONITOR];
    if (listAllSubmissionRoles.includes(userRole) || collaboratorUserIDs.length > 0) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID}}];
    }

    if (userRole === USER.ROLES.ORG_OWNER && aUserOrganization?.orgID) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID,"batch.organization._id": aUserOrganization?.orgID}}];
    }

    if (userRole === USER.ROLES.SUBMITTER) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID, "batch.submitterID": userID}}];
    }

    if (userRole === USER.ROLES.DC_POC && userDataCommonsNames?.length > 0) {
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

module.exports = {
    BatchService
}