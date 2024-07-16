class QCResult {
    constructor(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings) {
        this.type = type;
        this.validationType = validationType;
        this.submittedID = submittedID;
        this.batchID = batchID;
        this.displayID = displayID;
        this.severity = severity;
        this.uploadedDate = uploadedDate;
        this.validatedDate = validatedDate;
        this.errors = errors || [];
        this.warnings = warnings || [];
    }

    static create(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings) {
        return new QCResult(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings);
    }

}

module.exports = {
    QCResult
};