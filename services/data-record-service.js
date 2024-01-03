const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const METADATA_GROUP_ID = "crdcdh-metadata-validation";
const FILE_GROUP_ID = "crdcdh-file-validation";
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
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
                .concat(fileNodes?.length === 0 ? [ERROR.NO_VALIDATION_FILE] : []);

            if (errorMessages.length > 0) {
                return ValidationHandler.handle(errorMessages)
            }

            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID);
            return await sendSQSMessageWrapper(this.awsService, msg, FILE_GROUP_ID, submissionID, this.fileQueueName, submissionID);
        }
        return isMetadata ? ValidationHandler.success() : ValidationHandler.handle(ERROR.FAILED_VALIDATE_METADATA);
    }

    async submissionQCResults(submissionID, first, offset, orderBy, sortDirection) {
        let pipeline = [];
        pipeline.push({
            $match: {
                submissionID: submissionID,
                status: {
                    $in: [VALIDATION_STATUS.ERROR, VALIDATION_STATUS.WARNING]
                }
            }
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
        if (!!orderBy){
            const defaultSort = "uploadedDate";
            const sort = getSortDirection(sortDirection);
            qcResults.sort((a, b) => {
                let propA = a[orderBy] || a[defaultSort];
                let propB = b[orderBy] || a[defaultSort];
                if (propA > propB){
                    return sort;
                }
                if (propA < propB){
                    return sort * -1;
                }
                return 0;
            });
        }
        return {
            total: qcResults.length,
            results:qcResults.slice(offset, offset+first)
        };
    }
    
    async listBatchFiles(submissionID, batchID, first, offset, orderBy, sortDirection) {
        const latestBatch = (await this.batchCollection.find(batchID)).pop();

        let pipeline = [];
        pipeline.push({
            $match: {
                submissionID: submissionID,
                batchIDs: {$eq: batchID},
            }
        });
        const dataRecords = await this.dataRecordsCollection.aggregate(pipeline);
        const batchFiles = latestBatch.files?.map(file => {
            const dataRecord = dataRecords?.find((dataRecord) => dataRecord.orginalFileName === file.fileName);
            return {
                batchID: latestBatch._id,
                nodeType: dataRecord?.nodeType,
                fileName: file.fileName
            };
        });

        if (!!orderBy) {
            const defaultSort = "nodeType";
            const sort = getSortDirection(sortDirection);
            batchFiles.sort((a, b) => {
                let propA = a[orderBy] || a[defaultSort];
                let propB = b[orderBy] || b[defaultSort];
                if (!propA) {
                    return sort;
                }
                if (!propB) {
                    return sort * -1;
                }
                if (propA > propB){
                    return sort;
                }
                if (propA < propB){
                    return sort * -1;
                }
                return 0;
            });
        }

        return {
            total: batchFiles.length,
            batchFiles: batchFiles.slice(offset, offset+first)
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
        return ValidationHandler.success();
    } catch (e) {
        console.error(ERROR.FAILED_VALIDATE_METADATA, `submissionID:${submissionID}`, `queue-name:${queueName}`, `error:${e}`);
        return ValidationHandler.handle(`queue-name: ${queueName}. ` + e);
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


