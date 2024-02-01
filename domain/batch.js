const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4} = require("uuid");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
class Batch {
    constructor(submissionID, displayID, bucketName, filePrefix, type, status, metadataIntention) {
        this._id = v4();
        this.bucketName = bucketName;
        this.submissionID = submissionID;
        this.displayID = displayID;
        this.type = type;
        this.status = status;
        this.fileCount = 0;
        // Optional
        if (metadataIntention) {
            this.metadataIntention = metadataIntention;
        }
        this.files = [];
        this.createdAt = this.updatedAt = getCurrentTime();
        if (type === BATCH.TYPE.METADATA) {
            filePrefix += `/${this.createdAt?.getTime()}`;
        }
        this.filePrefix = filePrefix;
    }

    addDataFile(name, size){
        this.addFile(name, size, null, true)
    }

    addFile(name, size, signedURL, isDataFile) {
        const file = new BatchFile(name, size, signedURL, this.filePrefix, isDataFile);
        this.files.push(file);
        this.fileCount += 1;
    }

    static createNewBatch(submissionID, displayID, bucketName, filePrefix, type, metadataIntention = null) {
        const status = BATCH.STATUSES.UPLOADING;
        return new Batch(submissionID, displayID, bucketName, filePrefix, type, status, metadataIntention);
    }
}

class BatchFile {
    constructor(fileName, size, signedURL, filePrefix, isDataFile) {
        this.fileName = fileName;
        this.size = size;
        this.status = FILE.UPLOAD_STATUSES.NEW;
        if (signedURL) {
            this.signedURL = signedURL;
        }
        this.filePrefix = filePrefix;
        this.createdAt = this.updatedAt = getCurrentTime();
        this.errors = [];
        if (isDataFile){
            this.nodeType = BATCH.TYPE.DATA_FILE
        }
    }
}


module.exports = {
    Batch
};