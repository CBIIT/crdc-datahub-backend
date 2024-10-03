const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4, v5} = require("uuid");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const DCF_PREFIX = "dg.4DFC";
class Batch {
    constructor(submissionID, displayID, bucketName, filePrefix, type, status) {
        this._id = v4();
        this.bucketName = bucketName;
        this.submissionID = submissionID;
        this.displayID = displayID;
        this.type = type;
        if (type === BATCH.TYPE.DATA_FILE || type === BATCH.TYPE.FILE) {
            this.type = BATCH.TYPE.DATA_FILE;
        }
        this.status = status;
        this.fileCount = 0;
        this.files = [];
        this.createdAt = this.updatedAt = getCurrentTime();
        if (type === BATCH.TYPE.METADATA) {
            filePrefix += `/${this.createdAt?.getTime()}`;
        }
        this.filePrefix = filePrefix;
    }

    addDataFile(name, size, url, studyID, isOmitPrefix){
        const fileID = this.#generateDataFileUUID(name, url, studyID, isOmitPrefix);
        this.#addFile(name, size, null, true, fileID);
    }

    addMetadataFile(name, size, signedURL){
        this.#addFile(name, size, signedURL, false)
    }

    #generateDataFileUUID(fileName, url, studyID, isOmitPrefix) {
        const urlUUID = v5(url, v5.URL, undefined, undefined);
        const studyUUID = v5(studyID, urlUUID, undefined, undefined);
        const fileNameUUID = `${v5(fileName, studyUUID, undefined, undefined)}`
        return isOmitPrefix ? fileNameUUID : `${DCF_PREFIX}/${fileNameUUID}`;
    }


    #addFile(name, size, signedURL, isDataFile, fileID) {
        const file = new BatchFile(name, size, signedURL, this.filePrefix, isDataFile, fileID);
        this.files.push(file);
        this.fileCount += 1;
    }

    static createNewBatch(submissionID, displayID, bucketName, filePrefix, type) {
        const status = BATCH.STATUSES.UPLOADING;
        return new Batch(submissionID, displayID, bucketName, filePrefix, type, status);
    }
}

class BatchFile {
    constructor(fileName, size, signedURL, filePrefix, isDataFile, fileID) {
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
        if (fileID) {
            this.fileID = fileID;
        }
    }
}


module.exports = {
    Batch
};