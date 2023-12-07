const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const METADATA_GROUP_ID = "crdcdh-metadata-validation";
const FILE_GROUP_ID = "crdcdh-file-validation";
const ROLES = USER_CONSTANTS.USER.ROLES;
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService, submissionCollection, batchCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
        this.submissionCollection = submissionCollection;
        this.batchCollection = batchCollection;
    }

    async submissionStats(submissionID) {
        const groupPipeline = { "$group": { _id: "$nodeType", count: { $sum: 1 }} };
        const validNodeStatus = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        const groupByNodeType = await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, status: {$in: validNodeStatus}}}, groupPipeline]);

        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }} };
        const promises = groupByNodeType.map(async node =>
            [await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, nodeType: node?._id, status: {$in: validNodeStatus}}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(submissionID);
        submissionStatsRecords.forEach(aStatSet => {
            const [nodes, nodeName] = aStatSet;
            const stat = Stat.createStat(nodeName);
            nodes.forEach((node) => {
                stat.countNodeType(node?._id, node.count);
            });
            submissionStats.addStats(stat);
        });
        return submissionStats;
    }

    async validateMetadata(submissionID, types, scope) {
        isValidMetadata(types, scope);
        const isMetadata = types.some(t => t === VALIDATION.TYPES.METADATA);
        if (isMetadata) {
            const msg = Message.createMetadataMessage("Validate Metadata", submissionID, scope);
            const success = await sendSQSMessageWrapper(this.awsService, msg, METADATA_GROUP_ID, submissionID, this.metadataQueueName, submissionID);
            if (!success) {
                return false;
            }
        }
        const isFile = types.some(t => t === VALIDATION.TYPES.FILE);
        if (isFile) {
            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID);
            const success = await sendSQSMessageWrapper(this.awsService, msg, FILE_GROUP_ID, submissionID, this.fileQueueName, submissionID);
            if (!success) {
                return false;
            }

            const fileNodes = await getFileNodes(this.dataRecordsCollection, scope);
            const fileQueueResults = await Promise.all(fileNodes.map(async (aFile) => {
                const msg = Message.createFileNodeMessage("Validate File", aFile?.nodeID);
                return await sendSQSMessageWrapper(this.awsService, msg, FILE_GROUP_ID, aFile?.nodeID, this.fileQueueName, submissionID);
            }));
            return fileQueueResults.length > 0 && fileQueueResults.every(result => result);
        }
        return isMetadata;
    }

    async submissionQCResults(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([
                ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR, // A: can see submission details for all submissions
                ROLES.ORG_OWNER, // B: can see submission details for submissions associated with his/her own organization
                ROLES.SUBMITTER, // C: can see submission details for his/her own submissions
                ROLES.DC_POC // D: can see submission details for submissions associated with his/her Data Commons
            ]);
        const submissionID = params?._id;
        const userRole = context.userInfo?.role;
        let submission = null;
        if ([ROLES.ORG_OWNER, ROLES.SUBMITTER, ROLES.DC_POC].includes(userRole)){
            submission = (await this.submissionCollection.find(submissionID)).pop();
        }
        if (!!submission && (
            (userRole === ROLES.ORG_OWNER && context.userInfo?.organization?.orgID !== submission?.organization?._id) ||
            (userRole === ROLES.SUBMITTER && context.userInfo._id !== submission?.submitterID) ||
            (userRole === ROLES.DC_POC && !context.userInfo?.dataCommons.includes(submission?.dataCommons))
        )){
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }
        let pipeline = [];
        pipeline.push({
            $match: {
                submissionID: submissionID,
                status: {
                    $in: [VALIDATION_STATUS.ERROR, VALIDATION_STATUS.WARNING]
                }
            }
        });
        const orderBy = params.orderBy;
        if (!!orderBy){
            pipeline.push({
                $sort: {
                    [orderBy]: getSortDirection(params.sortDirection)
                }
            });
        }
        pipeline.push({
            $skip: params.offset
        });
        pipeline.push({
            $limit: params.first
        });
        const dataRecords = await this.dataRecordsCollection.aggregate(pipeline);
        const qcResults = await Promise.all(dataRecords.map(async dataRecord => {
            const latestBatchID = dataRecord.batchIDs?.slice(-1)[0];
            const latestBatch = (await this.batchCollection.find(latestBatchID)).pop();
            const severity = dataRecord.status;
            let description = [];
            if (severity === VALIDATION_STATUS.ERROR) {
                description = dataRecord.errors;
            }
            if (severity === VALIDATION_STATUS.WARNING) {
                description = dataRecord.warnings;
            }
            return {
                submissionID: dataRecord.submissionID,
                nodeType: dataRecord.nodeType,
                batchID: latestBatchID,
                nodeID: dataRecord.nodeID,
                CRDC_ID: dataRecord._id,
                severity: severity,
                uploadedDate: latestBatch.updatedAt,
                description: description
            };
        }));
        return {
            total: qcResults.length,
            results:qcResults
        };
    }
}

const getFileNodes = async (dataRecordsCollection, scope) => {
    const isNewScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase();
    const fileNodes = await dataRecordsCollection.aggregate([{
        $match: {
            s3FileInfo: { $exists: true, $ne: null },
            // case-insensitive search
            ...(isNewScope ? { status: { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}}
    ]);
    return fileNodes || [];
}

const sendSQSMessageWrapper = async (awsService, message, groupId, deDuplicationId, queueName, submissionID) => {
    try {
        await awsService.sendSQSMessage(message, groupId, deDuplicationId, queueName);
        return true;
    } catch (e) {
        console.error(ERROR.FAILED_INVALIDATE_METADATA, submissionID);
        return false;
    }
}

const isValidMetadata = (types, scope) => {
    const isValidTypes = types.every(t => t === VALIDATION.TYPES.FILE || t === VALIDATION.TYPES.METADATA);
    if (!isValidTypes) {
        throw new Error(ERROR.INVALID_SUBMISSION_TYPE);
    }
    // case-insensitive
    const isValidScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || scope?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase();
    if (!isValidScope) {
        throw new Error(ERROR.INVALID_SUBMISSION_SCOPE);
    }
}

class Message {
    constructor(type) {
        this.type = type;
    }
    static createMetadataMessage(type, submissionID, scope) {
        const msg = new Message(type);
        msg.submissionID = submissionID;
        msg.scope= scope;
        return msg;
    }

    static createFileSubmissionMessage(type, submissionID) {
        const msg = new Message(type);
        msg.submissionID = submissionID;
        return msg;
    }

    static createFileNodeMessage(type, fileID) {
        const msg = new Message(type);
        msg.fileID = fileID;
        return msg;
    }
}

class Stat {
    constructor(nodeName, totalCount, newCount, passedCount, warningCount, errorCount) {
        this.nodeName = nodeName;
        this.total = totalCount;
        this.new = newCount;
        this.passed = passedCount;
        this.warning= warningCount;
        this.error = errorCount;
    }

    static createStat(nodeName) {
        return new Stat(nodeName, 0,0,0,0, 0);
    }

    #addTotal(total) {
        this.total += total;
    }

    countNodeType(node, count) {
        switch (node) {
            case VALIDATION_STATUS.NEW:
                this.new += count;
                break;
            case VALIDATION_STATUS.ERROR:
                this.error += count;
                break;
            case VALIDATION_STATUS.WARNING:
                this.warning += count;
                break;
            case VALIDATION_STATUS.PASSED:
                this.passed += count;
                break;
            default:
                return;
        }
        this.#addTotal(count);
    }
}

class SubmissionStats {
    constructor(submissionID) {
        this.submissionID = submissionID;
        this.stats = [];
    }

    static createSubmissionStats(submissionID) {
        return new SubmissionStats(submissionID);
    }

    addStats(stat) {
        this.stats.push(stat);
    }
}

module.exports = {
    DataRecordService
};


