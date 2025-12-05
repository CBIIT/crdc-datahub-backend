const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {verifySession} = require("../verifier/user-info-verifier");
const {UserScope} = require("../domain/user-scope");
const QCResultDAO = require("../dao/qcResult");
const SubmissionDAO = require("../dao/submission");

class QcResultService{
    constructor(qcResultCollection, submissionCollection, authorizationService){
        this.qcResultCollection = qcResultCollection;
        this.submissionCollection = submissionCollection;
        this.authorizationService = authorizationService;
        this.qcResultDAO = new QCResultDAO(this.qcResultCollection);
        this.submissionDAO = new SubmissionDAO();
    }

    async submissionQCResultsAPI(params, context){
        verifySession(context)
            .verifyInitialized();
        const createScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (createScope.isNoneScope() && viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Check that the specified submissionID exists
        const submission = await this.submissionDAO.findFirst({id: params._id});
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        return await this.qcResultDAO.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.issueCode, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    /**
     * Delete QC results by submission ID
     * @param {string} submissionID - The submission ID
     * @param {string} dataType - The validation type (e.g., "file", "metadata")
     * @param {string[]} submittedIDs - Array of submitted identifiers. Can be file names (for file validation) or node IDs (for metadata validation)
     * @param {boolean} deleteAll - If true, delete all QC results for the submission and type
     * @param {string[]} exclusiveIDs - IDs to exclude from deletion when deleteAll is true
     */
    async deleteQCResultBySubmissionID(submissionID, dataType, submittedIDs, deleteAll = false, exclusiveIDs = []) {
        let query = {
            submissionID: submissionID,
            validationType: dataType
        };
        
        if (deleteAll) {
            // When deleteAll is true, delete all QC results for submissionID and type
            // If exclusiveIDs are provided, exclude them from deletion
            if (exclusiveIDs && exclusiveIDs.length > 0) {
                query.submittedID = {
                    notIn: exclusiveIDs
                };
            }
            // If no exclusiveIDs, query will delete all (no submittedID filter)
        } else {
            // Normal deletion: delete specific submittedIDs
            if (submittedIDs && submittedIDs.length > 0) {
                query.submittedID = {
                    in: submittedIDs
                };
            } else {
                // No submittedIDs provided, nothing to delete
                return;
            }
        }
        
        const res = await this.qcResultDAO.deleteMany(query);

        // Only validate count for non-deleteAll operations
        if (!deleteAll && submittedIDs && submittedIDs.length > 0 && (res.count === 0 || (submittedIDs.length !== res.count))) {
            console.error("An error occurred while deleting the qcResult records", `submissionID: ${submissionID}`);
        }
    }

    async findBySubmissionErrorCodes(submissionID, errorCode) {
        return this.qcResultDAO.findMany({
            submissionID: submissionID, errors: {some: {code: errorCode}}},
            {
                select: {
                    submittedID: true,
                    submissionID: true
            }
        });
    }

    async getQCResultsErrors(submissionID, errorType) {
        const result = await this.qcResultCollection.aggregate([
            {"$match": { submissionID: submissionID, type: errorType}},
            {"$project": {submittedID: 1, dataRecordID: 1}}
        ]);
        return result || [];
    }

    async resetQCResultData(submissionID) {
        return await this.qcResultDAO.deleteMany({submissionID});
    }

    async aggregatedSubmissionQCResultsAPI(params, context) {
        verifySession(context)
            .verifyInitialized();
        const createScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (createScope.isNoneScope() && viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Check that the specified submissionID exists
        const submission = await this.submissionDAO.findFirst({id: params.submissionID});
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        return await this.qcResultDAO.aggregatedSubmissionQCResults(params.submissionID, params.severity, params.first, params.offset, params.orderBy, params.sortDirection);
    }


    async _getUserScope(userInfo, permission) {
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
