const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const METADATA_GROUP_ID = "crdcdh-metadata-validation";
const FILE_GROUP_ID = "crdcdh-file-validation";
const EXPORT_GROUP_ID = "crdcdh-export-metadata";
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const config = require("../config");
const {data} = require("express-session/session/cookie");

const ERROR = "Error";
const WARNING = "Warning";
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService, batchCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
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
            if (!success.success) {
                return success;
            }
        }
        const isFile = types.some(t => t === VALIDATION.TYPES.FILE);
        if (isFile) {
            const fileNodes = await getFileNodes(this.dataRecordsCollection, submissionID, scope);
            const fileQueueResults = await Promise.all(fileNodes.map(async (aFile) => {
                const msg = Message.createFileNodeMessage("Validate File", aFile._id);
                return await sendSQSMessageWrapper(this.awsService, msg, FILE_GROUP_ID, aFile._id, this.fileQueueName, submissionID);
            }));
            const errorMessages = fileQueueResults
                .filter(result => !result.success)
                .map(result => result.message)
                // at least, a node must exists.
                .concat(fileNodes?.length === 0 ? [ERRORS.NO_VALIDATION_FILE] : []);

            if (errorMessages.length > 0) {
                return ValidationHandler.handle(errorMessages)
            }

            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID);
            return await sendSQSMessageWrapper(this.awsService, msg, FILE_GROUP_ID, submissionID, this.fileQueueName, submissionID);
        }
        return isMetadata ? ValidationHandler.success() : ValidationHandler.handle(ERRORS.FAILED_VALIDATE_METADATA);
    }

    async exportMetadata(submissionID) {
        const msg = Message.createFileSubmissionMessage("Export Metadata", submissionID);
        return await sendSQSMessageWrapper(this.awsService, msg, EXPORT_GROUP_ID, submissionID, config.export_queue, submissionID);
    }

    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection) {
        let pipeline = [];
        pipeline.push({
            $project: {
                submissionID: "$submissionID",
                nodeType: "$nodeType",
                batchID: {
                    $last: "$batchIDs"
                },
                displayID: "$displayID",
                nodeID: "$nodeID",
                CRDC_ID: "$_id",
                severity: "$status",
                uploadedDate: "$updatedAt",
                description: "$description"
            }
        })
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        if (severities === ERROR){
            severities = [ERROR];
        }
        else if (severities === WARNING){
            severities = [WARNING];
        }
        else {
            severities = [ERROR, WARNING];
        }
        pipeline.push({
            $match: {
                severity: {
                    $in: severities
                }
            }
        })
        if (!!nodeTypes && nodeTypes.length > 0) {
            pipeline.push({
               $match: {
                   nodeType: {
                       $in: nodeTypes
                   }
               }
            });
        }
        if (!!batchIDs && batchIDs.length > 0) {
            pipeline.push({
                $match: {
                    batchID: {
                        $in: batchIDs
                    }
                }
            });
        }
        let page_pipeline = [];
        page_pipeline.push({
            $sort: {
                [orderBy]: getSortDirection(sortDirection)
            }
        });
        page_pipeline.push({
            $skip: offset
        });
        page_pipeline.push({
            $limit: first
        });
        pipeline.push({
            $facet: {
                results: page_pipeline,
                total: [{
                    $count: "total"
                }]
            }
        });
        let dataRecords = await this.dataRecordsCollection.aggregate(pipeline);
        dataRecords = dataRecords.length > 0 ? dataRecords[0] : {}
        return {
            results: dataRecords.results || [],
            total: (dataRecords?.total?.length > 0) ? dataRecords.total[0]?.total : 0
        }
    }

    async listSubmissionNodeTypes(submissionID){
        if (!submissionID){
            return []
        };
        const filter = {
            submissionID: submissionID
        };
        return await this.dataRecordsCollection.distinct("nodeType", filter);
    }
}

const getFileNodes = async (dataRecordsCollection, submissionID, scope) => {
    const isNewScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase();
    const fileNodes = await dataRecordsCollection.aggregate([{
        $match: {
            s3FileInfo: { $exists: true, $ne: null },
            submissionID: submissionID,
            // case-insensitive search
            ...(isNewScope ? { status: { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}}
    ]);
    return fileNodes || [];
}

const sendSQSMessageWrapper = async (awsService, message, groupId, deDuplicationId, queueName, submissionID) => {
    try {
        await awsService.sendSQSMessage(message, groupId, deDuplicationId, queueName);
        return ValidationHandler.success();
    } catch (e) {
        console.error(ERRORS.FAILED_VALIDATE_METADATA, `submissionID:${submissionID}`, `queue-name:${queueName}`, `error:${e}`);
        return ValidationHandler.handle(`queue-name: ${queueName}. ` + e);
    }
}

const isValidMetadata = (types, scope) => {
    const isValidTypes = types.every(t => t === VALIDATION.TYPES.FILE || t === VALIDATION.TYPES.METADATA);
    if (!isValidTypes) {
        throw new Error(ERRORS.INVALID_SUBMISSION_TYPE);
    }
    // case-insensitive
    const isValidScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || scope?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase();
    if (!isValidScope) {
        throw new Error(ERRORS.INVALID_SUBMISSION_SCOPE);
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

    static createFileNodeMessage(type, dataRecordID) {
        const msg = new Message(type);
        msg.dataRecordID = dataRecordID;
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


