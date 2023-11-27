const {VALIDATION} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");

class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
    }

    async validateSubmission(submissionID, types, scope) {
        const isValidTypes = types.every(t => t?.toLowerCase() === VALIDATION.TYPES.FILE.toLowerCase() || t?.toLowerCase() === VALIDATION.TYPES.METADATA.toLowerCase());
        if (isValidTypes) {
            throw new Error(ERROR.INVALID_SUBMISSION_TYPE);
        }
        const isValidScope = scope.every(s => s?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || s?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase());
        if (!isValidScope) {
            throw new Error(ERROR.INVALID_SUBMISSION_SCOPE);
        }

        const isMetadata = types.some(t => t?.toLowerCase() === VALIDATION.TYPES.METADATA.toLowerCase());
        if (isMetadata) {
            // TODO Only
            this.awsService.sendSQSMessage(messageBody,groupID, deDuplicationId, queueName);
        }

        const isFile = types.some(t => t?.toLowerCase() === VALIDATION.TYPES.FILE.toLowerCase());
        if (isFile) {
            this.awsService.sendSQSMessage(messageBody,groupID, deDuplicationId, queueName);
        }
        // this.dataRecordsCollection;
    }
}

module.exports = {
    DataRecordService
};


