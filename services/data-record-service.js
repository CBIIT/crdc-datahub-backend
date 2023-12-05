const {VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const METADATA_GROUP_ID = "crdcdh-metadata-validation";
const FILE_GROUP_ID = "crdcdh-file-validation";
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
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

module.exports = {
    DataRecordService
};


