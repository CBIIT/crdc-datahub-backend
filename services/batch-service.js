const {Batch} = require("../domain/batch");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
const {NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED} = require("../constants/application-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {SUBMISSIONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const LOAD_METADATA = "Load Metadata";
class BatchService {
    constructor(s3Service, batchCollection, bucketName, awsService) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
        this.bucketName = bucketName;
        this.awsService = awsService;
    }

    async createBatch(params, rootPath, orgID) {
        const prefix = createPrefix(params, rootPath, orgID);
        const metadataIntention = params?.metadataIntention && params.type === BATCH.TYPE.METADATA ? params.metadataIntention : null;
        const newBatch = Batch.createNewBatch(params.submissionID, this.bucketName, prefix, params.type, metadataIntention);
        if (BATCH.TYPE.METADATA === params.type.toLowerCase()) {
            const submissionID = params.submissionID;
            await Promise.all(params.files.map(async (file) => {
                if (file.fileName) {
                    const signedURL = await this.s3Service.createPreSignedURL(this.bucketName, submissionID, file.fileName);
                    newBatch.addFile(file.fileName, file.size , signedURL);
                }
            }));
        } else {
            params.files.forEach((file) => {
                if (file.fileName) {
                    newBatch.addFile(file.fileName, file.size);
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
    async updateBatch(aBatch, files) {
        const uploadFiles = new Map(files
            .filter(aFile => (aFile?.fileName) && aFile?.fileName.trim().length > 0)
            .map(file => [file?.fileName, file]));
        const succeededFiles = [];
        for (const aFile of aBatch.files) {
            if (!uploadFiles.has(aFile.fileName)) {
                continue;
            }
            const aUploadFile = uploadFiles.get(aFile.fileName);
            aFile.updatedAt = getCurrentTime();
            if (aUploadFile?.succeeded) {
                aFile.status = FILE.UPLOAD_STATUSES.UPLOADED;
                succeededFiles.push(aFile);
                continue;
            }
            aFile.status = FILE.UPLOAD_STATUSES.FAILED;
            aFile.errors = aUploadFile?.errors || [];
        }
        // Count how many batch files updated from FE match the uploaded files.
        const isAllUploaded = files?.length > 0 && succeededFiles.length === files?.length;
        aBatch.status = isAllUploaded ? BATCH.STATUSES.UPLOADED : BATCH.STATUSES.FAILED;
        aBatch.updatedAt = getCurrentTime();
        await asyncUpdateBatch(this.awsService, this.batchCollection, aBatch);
        return await this.findByID(aBatch._id);
    }

    async listBatches(params, context) {
        let pipeline = listBatchConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization, params.submissionID, context.userInfo?.dataCommons);
        const pagination = [
            {"$sort": { [params.orderBy]: getSortDirection(params.sortDirection)}}, // default by displayID & Desc
            {"$skip": params.offset},
            {"$limit": params.first}
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

    async findByID(id) {
        const aBatch = await this.batchCollection.find(id);
        return (aBatch?.length > 0) ? aBatch[0] : null;
    }
}

const listBatchConditions = (userID, userRole, aUserOrganization, submissionID, userDataCommonsNames) => {
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
    const validStatusAndSubmissionID = {"submissionID": submissionID, "status": {$in: [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED]}};
    const listAllSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD, USER.ROLES.CURATOR];
    if (listAllSubmissionRoles.includes(userRole)) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID}}];
    }

    if (userRole === USER.ROLES.ORG_OWNER && aUserOrganization?.orgID) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID,"batch.organization._id": aUserOrganization?.orgID}}];
    }

    if (userRole === USER.ROLES.SUBMITTER) {
        return [...submissionJoin, {"$match": {"batch.submitterID": userID}}];
    }

    if (userRole === USER.ROLES.DC_POC && userDataCommonsNames?.length > 0) {
        return [...submissionJoin, {"$match": {...validStatusAndSubmissionID, "batch.dataCommons": {$in: userDataCommonsNames}}}];
    }
    throw new Error(ERROR.INVALID_SUBMISSION_PERMISSION);
}

const asyncUpdateBatch = async (awsService, batchCollection, aBatch) => {
    const updated = await batchCollection.update(aBatch);
    if (!updated?.acknowledged){
        const error = ERROR.FAILED_BATCH_UPDATE;
        console.error(error);
        throw new Error(error);
    }

    if (aBatch?.type === BATCH.TYPE.METADATA) {
        const message = { type: LOAD_METADATA, batchID: aBatch?._id };
        await awsService.sendSQSMessage(message);
    }
}

const createPrefix = (params, rootPath, orgID) => {
    if (rootPath) {
        return `${rootPath}/${params.type}/`;
    }
    if (!orgID) {
        throw new Error(ERROR.NEW_BATCH_NO_ORGANIZATION);
    }
    const prefixArray = [orgID, params.submissionID];
    prefixArray.push(params.type === BATCH.TYPE.METADATA ? BATCH.TYPE.METADATA : BATCH.TYPE.FILE);
    return prefixArray.join("/");
}

module.exports = {
    BatchService
}