const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4} = require("uuid");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
class Batch {
    constructor(submissionID, bucketName, filePrefix, type, status, metadataIntention) {
        this._id = v4();
        this.bucketName = bucketName;
        this.filePrefix = filePrefix;
        this.submissionID = submissionID;
        this.type = type;
        this.status = status;
        this.fileCount = 0;
        // Optional
        if (metadataIntention) {
            this.metadataIntention = metadataIntention;
        }
        this.files = [];
        this.createdAt = this.updatedAt = getCurrentTime();
    }

    addFile(name, size, signedURL) {
        const file = new BatchFile(name, size, signedURL, this.filePrefix);
        this.files.push(file);
        this.fileCount += 1;
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
        this.status = FILE.UPLOAD_STATUSES.NEW;
        if (signedURL) {
            this.signedURL = signedURL;
        }
        this.filePrefix = filePrefix;
        this.createdAt = this.updatedAt = getCurrentTime();
        this.errors = [];
    }
}


module.exports = {
    Batch
};