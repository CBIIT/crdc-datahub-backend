const ERROR = require("../constants/error-constants");

function verifyBatch(batch) {
    return new BatchVerifier(batch);
}

class BatchVerifier {
    constructor(batch) {
        this.submissionID = batch?.submissionID;
        this.batchType = batch?.type;
        this.files = batch?.files;
        this.batchID = batch?.batchID;
        this.uploading = batch?.uploading;
    }

    isUndefined() {
        if (!Array.isArray(this.files)) {
            throw new Error(ERROR.VERIFY.UNDEFINED_BATCH_FILE);
        }
        if (!this.submissionID) {
            throw new Error(ERROR.VERIFY.UNDEFINED_BATCH_SUBMISSION_ID);
        }
        if (!this.batchType) {
            throw new Error(ERROR.VERIFY.UNDEFINED_BATCH_TYPE);
        }
        return this;
    }

    notEmpty() {
        if (this.uploading !== true && (!this.files||!this.files?.length || this.files.length === 0)) {
            throw new Error(ERROR.VERIFY.EMPTY_BATCH_FILE);
        }
        return this;
    }

    isValidBatchID() {
        if (!this.batchID) {
            throw new Error(ERROR.VERIFY.UNDEFINED_BATCH_ID);
        }
        return this;
    }

    type(type) {
        if (!Array.isArray(type)){
            type = [type];
        }
        if (!type.includes(this.batchType.toLowerCase())) {
            throw Error(ERROR.VERIFY.INVALID_BATCH_TYPE);
        }
        return this;
    }
}

module.exports = {
    verifyBatch
}