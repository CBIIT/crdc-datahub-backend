const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
const {NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED} = require("../constants/application-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {SUBMISSIONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
class BatchService {
    constructor(s3Service, batchCollection, bucketName) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
        this.bucketName = bucketName;
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

    async listBatches(params, context) {
        let pipeline = listBatchConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization, params.submissionID, context.userInfo?.dataCommons);
        const pagination = [
            {"$sort": { [params.orderBy]: getSortDirection(params?.sortDirection)}}, // default by displayID & Desc
            {"$skip": params.offset},
            {"$limit": params.first}
        ];
        const promises = [
            await this.batchCollection.aggregate(pipeline.concat(pagination)),
            await this.batchCollection.aggregate(pipeline.concat([{$group: {_id: null, itemCount: { $sum: 1 }}}]))
        ];
        return await Promise.all(promises).then(function(results) {
            return {
                batches: (results[0] || []).map((batch)=>(batch)),
                total: results[1]?.itemCount || 0
            }
        });
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