const ERROR = require("../constants/error-constants");
const {VALIDATION_STATUS, VALIDATION} = require("../constants/submission-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {replaceErrorString} = require("../utility/string-util");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {verifySession} = require("../verifier/user-info-verifier");
const {UserScope} = require("../domain/user-scope");

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

function formatSeverityFilter(severity){
    if (!severity || typeof severity !== "string"){
        return null;
    }
    severity = severity.toLowerCase();
    if (severity === VALIDATION_STATUS.ERROR.toLowerCase()){
        return VALIDATION_STATUS.ERROR;
    }
    if (severity === VALIDATION_STATUS.WARNING.toLowerCase()){
        return VALIDATION_STATUS.WARNING;
    }
    return null;
}

class QcResultService{
    constructor(qcResultCollection, submissionCollection, authorizationService){
        this.qcResultCollection = qcResultCollection;
        this.submissionCollection = submissionCollection;
        this.authorizationService = authorizationService;
    }

    async submissionQCResultsAPI(params, context){
        verifySession(context)
            .verifyInitialized();
        const createScope = await this.getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        const viewScope = await this.getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (createScope.isNoneScope() && viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Check that the specified submissionID exists
        const submission = await this.submissionCollection.findOne(params._id);
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        return await this.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.issueCode, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, issueCode, first, offset, orderBy, sortDirection){
        // Create lookup pipeline
        let pipeline = [];
        // Filter by submission ID
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Filter by severity
        let arrayWithElements = {
            $exists: true,
            $type: 'array',
            $ne: []
        }
        if (severities === VALIDATION_STATUS.ERROR){
            pipeline.push({
                $match: {
                    errors: arrayWithElements
                }
            });
        }
        else if (severities === VALIDATION_STATUS.WARNING){
            pipeline.push({
                $match: {
                    warnings: arrayWithElements
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
        // Filter by issueCode
        if (!!issueCode){
            // Check if the specified issueCode is in any of the qcResult's errors or warnings
            pipeline.push({
                $match:{
                    $or: [
                        {"errors.code": issueCode},
                        {"warnings.code": issueCode}
                    ]
                }
            })
        }
        pipeline.push({
            $set:{
                batchID: "$latestBatchID"
            }
        })
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

    async findBySubmissionErrorCodes(submissionID, errorCode) {
        const result = await this.qcResultCollection.aggregate([
            {"$match": { submissionID: submissionID, "errors.code": errorCode}},
            {"$project": {submittedID: 1, submissionID: 1}}
        ]);
        return result || [];
    }

    async getQCResultsErrors(submissionID, errorType) {
        const result = await this.qcResultCollection.aggregate([
            {"$match": { submissionID: submissionID, type: errorType}},
            {"$project": {submittedID: 1, dataRecordID: 1}}
        ]);
        return result || [];
    }

    async resetQCResultData(submissionID) {
        return await this.qcResultCollection.deleteMany({"submissionID": submissionID});
    }

    async aggregatedSubmissionQCResultsAPI(params, context) {
        verifySession(context)
            .verifyInitialized();
        const createScope = await this.getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        const viewScope = await this.getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (createScope.isNoneScope() && viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Check that the specified submissionID exists
        const submission = await this.submissionCollection.findOne(params.submissionID);
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        return await this.aggregatedSubmissionQCResults(params.submissionID, params.severity, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async aggregatedSubmissionQCResults(submissionID, severity, first, offset, orderBy, sortDirection) {
        // Create lookup pipeline
        let basePipeline = [];
        // Filter by submission ID
        basePipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Set severity field
        basePipeline.push({
            $set: {
                "errors.severity": VALIDATION_STATUS.ERROR,
                "warnings.severity": VALIDATION_STATUS.WARNING
            }
        })
        // Combine warnings and errors arrays
        basePipeline.push({
            $set: {
                issues: {
                    $concatArrays: ["$warnings", "$errors"]
                }
            }
        })
        // Unwind issues array
        basePipeline.push({
            $unwind:{
                path: "$issues"
            }
        });
        // Filter by severity
        // Format severity filter
        let severityFilter = formatSeverityFilter(severity);
        // Add the severity filter to the pipeline
        if (!!severityFilter) {
            basePipeline.push({
                $match:{
                    "issues.severity": severityFilter
                }
            });
        }
        // Aggregate and count the results
        basePipeline.push({
            $group:{
                _id: {
                    title: "$issues.title",
                    severity: "$issues.severity",
                    code: "$issues.code"
                },
                count: {
                    $sum: 1
                }
            }
        });
        // Format the output
        basePipeline.push({
            $project:{
                _id: 0,
                    title: "$_id.title",
                severity: "$_id.severity",
                code: "$_id.code",
                count: "$count"
            }
        });
        // Create count pipeline
        let countPipeline = [...basePipeline];
        countPipeline.push({
            $count: "total"
        });
        // Create pagination pipeline
        let paginationPipeline = [...basePipeline];
        // Sort the results
        paginationPipeline.push({
            $sort: {
                [orderBy]: getSortDirection(sortDirection)
            }
        });
        // Paginate
        if (offset > 0){
            paginationPipeline.push({
                $skip: offset
            });
        }
        if (first > 0){
            paginationPipeline.push({
                $limit: first
            });
        }
        // Run pipelines
        const countPipelineResult = await this.qcResultCollection.aggregate(countPipeline);
        const totalRecords = countPipelineResult[0]?.total;
        const paginatedPipelineResult = await this.qcResultCollection.aggregate(paginationPipeline);
        return {
            total: totalRecords,
            results: paginatedPipelineResult
        };
    }

    async getUserScope(userInfo, permission) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, permission);
        const userScope = UserScope.create(validScopes);
        // valid scopes; none, all, role/role:RoleScope
        const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope() || userScope.isStudyScope() || userScope.isDCScope() || userScope.isOwnScope();
        if (!isValidUserScope) {
            console.warn(ERROR.INVALID_USER_SCOPE, permission);
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }
}

class QCResult {
    constructor(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID, origin) {
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
        if (origin) {
            this.origin = origin;
        }
    }

    static create(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID, origin) {
        return new QCResult(type, validationType, submittedID, batchID, displayID, severity, uploadedDate, validatedDate, errors, warnings, dataRecordID, origin);
    }

}

class QCResultError {
    constructor(title, description, severity, code) {
        this.title = title;
        this.description = description;
        this.severity = severity;
        this.code = code;
    }

    static create(title, description, severity, code) {
        return new QCResultError(title, description, severity, code);
    }
}

module.exports = {
    QcResultService
};
