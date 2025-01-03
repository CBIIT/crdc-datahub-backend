const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {VALIDATION_STATUS, VALIDATION} = require("../constants/submission-constants");
const {verifyValidationResultsReadPermissions} = require("../verifier/permissions-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {replaceErrorString} = require("../utility/string-util");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4} = require("uuid");
const ROLES = USER_CONSTANTS.USER.ROLES;

function replaceNaN(results, replacement){
    results?.map((result) => {
        Object.keys(result).forEach((key) => {
            if (Object.is(result[key], Number.NaN)){
                result[key] = replacement;
            }
        })
    });
    return results;
}

class QcResultService{
    constructor(qcResultCollection, submissionCollection){
        this.qcResultCollection = qcResultCollection;
        this.submissionCollection = submissionCollection;
    }

    async submissionQCResultsAPI(params, context){
        // Check that the specified submissionID exists
        const submission = await this.submissionCollection.findOne(params._id);
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        // Check that the user is authorized to view the QC results
        if (!verifyValidationResultsReadPermissions(context.userInfo, submission)){
            // Unauthorized Federal Monitors require a different error message
            if (context.userInfo?.role === ROLES.FEDERAL_MONITOR){
                throw new Error(ERROR.INVALID_ROLE_STUDY);
            }
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }

        return await this.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }


    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection){
        // Create lookup pipeline
        let pipeline = [];
        // Filter by submission ID
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Filter by severity
        if (severities === VALIDATION_STATUS.ERROR){
            pipeline.push({
                $match: {
                    severity: VALIDATION_STATUS.ERROR
                }
            });
        }
        // Filter by batch IDs
        if (!!batchIDs && batchIDs.length > 0){
            // If multiple batchIDs are specified, then only the first will be used for the filter
            const batchID = batchIDs[0];
            // Check if any of the specified batchIDs are in the qcResult
            pipeline.push({
                $match:{
                    latestBatchID: batchID
                }
            })
        }
        // Filter by nodeTypes
        if (!!nodeTypes && nodeTypes.length > 0){
            // Check if any of the specified nodeTypes are in the qcResult
            pipeline.push({
                $match:{
                    type: {
                        $in: nodeTypes
                    }
                }
            })
        }
        // Create count pipeline
        let countPipeline = [...pipeline];
        countPipeline.push({
            $count: "total"
        });
        const countPipelineResult = await this.qcResultCollection.aggregate(countPipeline);
        const totalRecords = countPipelineResult[0]?.total;
        // Create paginated pipeline
        let pagedPipeline = [...pipeline];
        const nodeType = "type";
        let sortFields = {
            [orderBy]: getSortDirection(sortDirection),
        };
        if (orderBy !== nodeType){
            sortFields[nodeType] = 1
        }
        pagedPipeline.push({
            $sort: sortFields
        });
        pagedPipeline.push({
            $skip: offset
        });
        if (first > 0){
            pagedPipeline.push({
                $limit: first
            });
        }
        const pagedPipelineResult = await this.qcResultCollection.aggregate(pagedPipeline);
        const dataRecords = replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }

    async deleteQCResultBySubmissionID(submissionID, dataType, fileNames) {
        const res = await this.qcResultCollection.deleteMany({"submissionID": submissionID, validationType: dataType, submittedID: { "$in": fileNames }});
        if (!res.acknowledged || (res.deletedCount > 0 && fileNames.length !== res.deletedCount)) {
            console.error("An error occurred while deleting the qcResult records", `submissionID: ${submissionID}`);
        }
    }

    async insertErrorRecord(submissionID, qcRecords) {
        const qcResultErrors = qcRecords?.map((record) => {
            const errorMsg = QCResultError.create(
                record.error.title,
                replaceErrorString(record.error.desc, `'${record.fileName}'`)
            );
            return QCResult.create(VALIDATION.TYPES.DATA_FILE, VALIDATION.TYPES.DATA_FILE, record.fileName, null, null, VALIDATION_STATUS.ERROR, getCurrentTime(), getCurrentTime(), [errorMsg], [], record.dataRecordID);
        });

        await Promise.all(qcResultErrors.map(async (qcResult) => {
            const res = await this.qcResultCollection.findOneAndUpdate({ submissionID: submissionID, submittedID: qcResult.submittedID, type: VALIDATION.TYPES.DATA_FILE},
                qcResult, {returnDocument: 'after', upsert: true});
            if (!res?.value) {
                console.error(ERROR.FAILED_INSERT_QC_RESULT + ` submissionID: ${submissionID}`);
            }
        }));
    }

    async getQCResultsErrors(submissionID, errorType) {
        const result = await this.qcResultCollection.aggregate([
            {"$match": { submissionID: submissionID, type: errorType}},
            {"$project": {submittedID: 1, dataRecordID: 1}}
        ]);
        return result || [];
    }
}

class QCResult {
    constructor(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID) {
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
        this.dataRecordID = dataRecordID;
    }

    static create(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID) {
        return new QCResult(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID);
    }

}

class QCResultError {
    constructor(title, description) {
        this.title = title;
        this.description = description;
    }

    static create(title, description) {
        return new QCResultError(title, description);
    }
}

module.exports = {
    QcResultService
};
