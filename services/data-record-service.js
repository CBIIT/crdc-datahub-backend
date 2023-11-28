const {VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const GROUP_ID = "crdcdh-metadata-validation";
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
            const msg = Message.createMetadataMessage("Validate Metadata", submissionID);
            try {
                await this.awsService.sendSQSMessage(msg, GROUP_ID, submissionID, this.metadataQueueName);
            } catch (e) {
                console.error(ERROR.FAILED_INVALIDATE_METADATA, submissionID);
                return false;
            }
        }
        const isFile = types.some(t => t === VALIDATION.TYPES.FILE);
        if (isFile) {
            const isNewScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase();
            const fileNodes = await this.dataRecordsCollection.aggregate([{
                $match: {
                    s3FileInfo: { $exists: true, $ne: null },
                    // case-insensitive search
                    ...(isNewScope ? { status: { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}}
            ]);
            const fileQueueResults = await Promise.all(fileNodes.map(async (aFile) => {
                const msg = Message.createFileNodeMessage("Validate File", aFile?.nodeID);
                try {
                    await this.awsService.sendSQSMessage(msg, GROUP_ID, aFile?.nodeID, this.fileQueueName);
                    return true;
                } catch (e) {
                    console.error(ERROR.FAILED_INVALIDATE_METADATA, submissionID);
                    return false;
                }
            }));
            return fileQueueResults.length > 0 && fileQueueResults.every(result => result);
        }
        return isMetadata;
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
    static createMetadataMessage(type, submissionID) {
        const msg = new Message(type);
        msg.submissionID = submissionID;
        msg.scope= VALIDATION.SCOPE.NEW;
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


