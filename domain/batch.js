const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4} = require("uuid");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
class Batch {
    constructor(submissionID, bucketName, filePrefix, type, status, metadataIntention) {
        this.bucketName = bucketName;
        this.filePrefix = filePrefix;
        this.submissionID = submissionID;
        this.type = type;
        this.status = status;
        // Optional
        if (metadataIntention) {
            this.metadataIntention = metadataIntention;
        }
        this.files = [];
        this.createdAt = this.updatedAt = getCurrentTime();
    }

    addFile(name, size) {
        const file = new BatchFile(name, size, this.filePrefix);
        this.files.push(file)
    }

    static createNewBatch(submissionID, bucketName, filePrefix, type, metadataIntention = null) {
        const status = BATCH.STATUSES.NEW;
        return new Batch(submissionID, bucketName, filePrefix, type, status, metadataIntention);
    }
}

class BatchFile {
    constructor(fileName, size, signedURL, filePrefix) {
        this.fileName = fileName;
        this.size = size;
        this.signedURL = signedURL;
        this.filePrefix = filePrefix;
        this.createdAt = this.updatedAt = getCurrentTime();
    }
}


module.exports = {
    Batch
};