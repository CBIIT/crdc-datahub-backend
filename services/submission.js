const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession, verifyApiToken, verifySubmitter} = require("../verifier/user-info-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {formatName} = require("../utility/format-name");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const { API_TOKEN } = require("../constants/application-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";
const config = require("../config");
const path = require("path");
const {AWSService} = require("./aws-request");
const {getSubmisssionRootPath} = require("../utility/string-util");


function listConditions(userID, userRole, userDataCommons, userOrganization, params){
    const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED]}};
    // Default conditons are:
    // Make sure application has valid status
    let conditions = {...validApplicationStatus};
    // Filter on organization and status
    if (params.organization !== ALL_FILTER) {
        conditions = {...conditions, "organization.name": params.organization};
    }
    if (params.status !== ALL_FILTER) {
        conditions = {...conditions, status: params.status};
    }
    // List all applications if Fed Lead / Admin / Data Concierge / Data Curator
    const listAllApplicationRoles = [ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR];
    if (listAllApplicationRoles.includes(userRole)) {
        return [{"$match": conditions}];
    }
    // If data commons POC, return all data submissions assoicated with their data commons
    if (userRole === ROLES.DC_POC) {
        conditions = {...conditions, "dataCommons": {$in: userDataCommons}};
        return [{"$match": conditions}];
    }
     // If org owner, add condition to return all data submissions associated with their organization
    if (userRole === ROLES.ORG_OWNER && userOrganization?.orgName) {
        conditions = {...conditions, "organization.name": userOrganization.orgName};
        return [{"$match": conditions}];
    }

    // Add condition so submitters will only see their data submissions
    // User's cant make submissions, so they will always have no submissions 
    // search by applicant's user id
    conditions = {...conditions, "submitterID": userID};
    return [{"$match": conditions}];
}

function validateCreateSubmissionParams (params) {
    if (!params.name || !params.studyAbbreviation || !params.dataCommons || !params.dbGaPID) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_PARAMS);
    }
}

function validateListSubmissionsParams (params) {
    if (params.status !== NEW &&
        params.status !== IN_PROGRESS &&
        params.status !== SUBMITTED &&
        params.status !== RELEASED &&
        params.status !== COMPLETED &&
        params.status !== ARCHIVED &&
        params.status !== ALL_FILTER
        ) {
        throw new Error(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER);
    }
    // Don't need to validate organization as frontend uses the same organization collection
    // as backend does as selection options. AKA, frontend will only ever send valid organizations.
}
/**
 * This class provides services to list log files based on submission Id
 */
const UPLOAD_TYPES = ['file','metadata'];
const LOG_DIR = 'log';
const LOG_FILE_EXT ='.log';
class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.aws = null;
    }

    async createSubmission(params, context) {
        // TODO: Add this requirement: Study abbreviation must have an approved application within user's organization
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER]);
        validateCreateSubmissionParams(params);
        const userInfo = context.userInfo;
        if (!userInfo.organization) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED);
        }
        const newSubmission = {
            _id: v4(),
            name: params.name,
            submitterID: userInfo._id,
            submitterName: formatName(userInfo),
            organization: {_id: userInfo?.organization?.orgID, name: userInfo?.organization?.orgName},
            // TODO: As of MVP2, only CDS is allowed. Change filtering in the future.
            dataCommons: "CDS",
            modelVersion: "string for future use",
            studyAbbreviation: params.studyAbbreviation,
            dbGaPID: params.dbGaPID,
            // TODO: get bucket name from organziation database
            bucketName: "get from database",
            // TODO: get rootpath name from organziation database
            rootPath: "organization/study?",
            status: NEW,
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            // TODO: get conceirge data from organization database
            concierge: "get from organization database?",
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime()
        };

        const res = await this.submissionCollection.insert(newSubmission);
        if (!(res?.acknowledged)) {
            throw new Error(ERROR.CREATE_SUBMISSION_INSERTION_ERROR);
        }
        return newSubmission;
    }

    async listSubmissions(params, context) {
        verifySession(context)
            .verifyInitialized();
        validateListSubmissionsParams(params);
        let pipeline = listConditions(context.userInfo._id, context.userInfo?.role, context.userInfo.dataCommons, context.userInfo?.organization, params);
        if (params.orderBy) pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });

        const pagination = [];
        if (params.offset) pagination.push({"$skip": params.offset});
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (!disablePagination) {
            pagination.push({"$limit": params.first});
        }
        const promises = [
            await this.submissionCollection.aggregate((!disablePagination) ? pipeline.concat(pagination) : pipeline),
            await this.submissionCollection.aggregate(pipeline)
        ];
        
        return await Promise.all(promises).then(function(results) {
            return {
                submissions: results[0] || [],
                total: results[1]?.length || 0
            }
        });
    }

    async createBatch(params, context) {
        //updated to handle both API-token and session.
        let userInfo = null;
        if(context[API_TOKEN])
            userInfo = verifyApiToken(context, config.token_secret);
        else{
            verifySession(context)
            .verifyInitialized();
            userInfo = context?.userInfo;
        }
        
        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.FILE])
        // Optional metadata intention
        if (params.type === BATCH.TYPE.METADATA) {
            verifyBatch(params)
                .metadataIntention([BATCH.INTENTION.NEW]);
        }
        const aSubmission = await this.findByID(params.submissionID);
        const aOrganization = await this.organizationService.getOrganizationByName(userInfo?.organization?.orgName);
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
        return await this.batchService.createBatch(params, aSubmission?.rootPath, aOrganization?._id);
    }

    async findByID(id) {
        const result = await this.submissionCollection.aggregate([{
            "$match": {
                _id: id
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }
    /**
     * API to get list of upload log files
     * @param {*} params 
     * @param {*} context 
     * @returns filelist []
     */
    async listLogs(params, context){
        //1) verify session
        verifySession(context)
            .verifyInitialized();
        //2) verify submitter
        const submission = await verifySubmitter(context.userInfo, params?.submissionID, this.submissionCollection, this.userService);
        //3) get upload log files
        const rootPath = await getSubmisssionRootPath(submission, this.organizationService);
        try {
            const fileList = await this.getLogFiles(config.submission_aws_bucket_name, rootPath);
            return {logFiles: fileList} 
        }
        catch(err)
        {
            throw new Error(`${ERROR.FAILED_LIST_LOG}, ${params.submissionID}! ${err}`);
        }
    }
    /**
     * 
     * @param {*} params as objerct {} cotains submissisonID
     * @param {*} context 
     * @returns fileList []
     */
    async getLogFiles(bucket, rootPath){
        this.aws = new AWSService();
        let fileList = []; 
        for (let type of UPLOAD_TYPES){
            let file = await this.aws.getLastFileFromS3(bucket, `${rootPath}/${type}/${LOG_DIR}`, type, LOG_FILE_EXT);
            if(file) fileList.push(file);
        }
        return fileList;
    }
   
    /**
     * Don't need based on analysis
     * @param {*} params as object {}  contains submissionID and file name
     * @returns file object
     */
    async downloadLog(params){
        let file = null;
        //to do
        //1) verify session
        //2) verify submitter
        //3) call aws s3 list objects based on the path.
        return file;
    }
}

const verifyBatchPermission= async(userService, aSubmission, userInfo) => {
    // verify submission owner
    if (!aSubmission) {
        throw new Error(ERROR.SUBMISSION_NOT_EXIST);
    }
    const aUser = await userService.getUserByID(aSubmission?.submitterID);
    if (isPermittedUser(aUser, userInfo)) {
        return;
    }
    // verify submission's organization owner by an organization name
    const organizationOwners = await userService.getOrgOwnerByOrgName(aSubmission?.organization);
    for (const aUser of organizationOwners) {
        if (isPermittedUser(aUser, userInfo)) {
            return;
        }
    }
    throw new Error(ERROR.INVALID_BATCH_PERMISSION);
}

const isPermittedUser = (aTargetUser, userInfo) => {
    return aTargetUser?.email === userInfo.email && aTargetUser?.IDP === userInfo.IDP
}

module.exports = {
    Submission
};
 