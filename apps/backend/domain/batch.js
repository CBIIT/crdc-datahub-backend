const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v5} = require("uuid");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const DCF_PREFIX = "dg.4DFC";
class Batch {
    constructor(submissionID, displayID, bucketName, filePrefix, type, status, submitterID, submitterName) {
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
        this.submitterID = submitterID;
        this.submitterName = submitterName;
    }

    addDataFile(name, url, studyID, isOmitPrefix){
        const fileID = this._generateDataFileUUID(name, url, studyID, isOmitPrefix);
        this._addFile(name, null, true, fileID);
    }

    addMetadataFile(name, signedURL){
        this._addFile(name, signedURL, false)
    }

    _generateDataFileUUID(fileName, url, studyID, isOmitPrefix) {
        const urlUUID = v5(url, v5.URL, undefined, undefined);
        const studyUUID = v5(studyID, urlUUID, undefined, undefined);
        const fileNameUUID = `${v5(fileName, studyUUID, undefined, undefined)}`
        return isOmitPrefix ? fileNameUUID : `${DCF_PREFIX}/${fileNameUUID}`;
    }


    _addFile(name, signedURL, isDataFile, fileID) {
        const file = new BatchFile(name, signedURL, this.filePrefix, isDataFile, fileID);
        this.files.push(file);
        this.fileCount += 1;
    }

    static createNewBatch(submissionID, displayID, bucketName, filePrefix, type, submitterID, submitterName) {
        const status = BATCH.STATUSES.UPLOADING;
        return new Batch(submissionID, displayID, bucketName, filePrefix, type, status, submitterID, submitterName);
    }
}

class BatchFile {
    constructor(fileName, signedURL, filePrefix, isDataFile, fileID) {
        this.fileName = fileName;
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