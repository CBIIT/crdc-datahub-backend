const {VALIDATION, NODES} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
// TODO
const GROUP_ID = "crdcdh-validation";
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
    }

    async validateSubmission(submissionID, types, scope) {
        isValidSubmission(types, scope);
        const isMetadata = types.some(t => t === VALIDATION.TYPES.METADATA);
        if (isMetadata) {
            const msg = Message.createMetadataMessage("Validate Metadata", submissionID);
            await this.awsService.sendSQSMessage(msg, GROUP_ID, submissionID, this.metadataQueueName);
            return true;
        }
        const isFile = types.some(t => t === VALIDATION.TYPES.FILE);
        if (isFile) {
            const isNewScope = scope.every(s => s?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase());
            const fileNodes = await this.dataRecordsCollection.aggregate([{
                $match: {
                    nodeType: NODES.FILE,
                    s3FileInfo: { $exists: true, $ne: null },
                    ...(isNewScope ? { status: VALIDATION.SCOPE.NEW } : {})}}
            ]);
            await Promise.all(fileNodes.map(async (aFile) => {
                const msg = Message.createFileNodeMessage("Validate File", aFile?.nodeID);
                await this.awsService.sendSQSMessage(msg, GROUP_ID, aFile?.nodeID, this.fileQueueName);
            }));
            return true;
        }
        return false;
    }
}

const isValidSubmission = (types, scope) => {
    const isValidTypes = types.every(t => t === VALIDATION.TYPES.FILE || t === VALIDATION.TYPES.METADATA);
    if (isValidTypes) {
        throw new Error(ERROR.INVALID_SUBMISSION_TYPE);
    }
    // case-insensitive
    const isValidScope = types?.length === 1 && scope.some(s => s?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || s?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase());
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


