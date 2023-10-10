const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
const {NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED} = require("../constants/application-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {APPLICATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
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
        let pipeline = listBatchConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization, params.submissionID);
        if (params.orderBy) {
            pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });
        }
        const pagination = [];
        if (params.offset) {
            pagination.push({"$skip": params.offset});
        }
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (!disablePagination) {
            pagination.push({"$limit": params.first});
        }
        const promises = [
            await this.batchCollection.aggregate((!disablePagination) ? pipeline.concat(pagination) : pipeline),
            // only get the total number of items
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

const listBatchConditions = (userID, userRole, aUserOrganization, submissionID) => {
    // list all applications
    const applicationJoinConditions = [
        {"$lookup": {
            from: APPLICATION_COLLECTION,
            localField: "submissionID",
            foreignField: "_id",
            as: "application"
        }},
        {"$unwind": {
            path: "$application",
        }}
    ];

    const validBatchStatus = {"application.status": {$in: [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED]}};
    const listAllBatchRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD, USER.ROLES.CURATOR];
    if (listAllBatchRoles.includes(userRole)) {
        return [...applicationJoinConditions, {"$match": {"submissionID": submissionID, ...validBatchStatus}}];
    }

    let conditions = [
        // search by applicant's user id
        {$and: [{"application.applicant.applicantID": userID}, validBatchStatus]}
        // TODO customize and project queries
        // {"$project" : {
        //     "_id": 0,
        //     "application.organization": 1,
        //     "application.applicant": 1,
        //     "submissionID": 1,
        // }}
    ];
    // search by user's organization
    if (userRole === USER.ROLES.ORG_OWNER && aUserOrganization?.orgID) {
        conditions.push({$and: [{"application.organization._id": aUserOrganization.orgID}, validBatchStatus]})
    }
    // TODO Data Commons POC roles
    return [
        ...applicationJoinConditions,
        {"$match": {"$or": conditions}}];
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