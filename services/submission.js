const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELLED,
    REJECTED, WITHDRAWN,ACTIONS} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession, verifyApiToken} = require("../verifier/user-info-verifier");
const {verifySubmissionAction} = require("../verifier/submission-verifier");
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

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
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

    async submissionAction(params, context){
        verifySession(context)
            .verifyInitialized();
        const userInfo = context.userInfo;
        const submissionID = params?.submissionID;
        const action = params?.action;
        //verify submission action
        const verifier = verifySubmissionAction(submissionID, action);
        //verify if a submission can be find by submissionID.
        let submission = await verifier.exists(this.submissionCollection);
        //verify if the action is valid based on current submission status
        verifier.isValidAction(submissionActionMap);
        //verify if user's role is valide for the action
        const newStatus = verifier.inRoles(userInfo);
        //update submission
        submission.status = newStatus;
        let events = submission.history;
        if(!events) events = [];
        events.push(HistoryEventBuilder.createEvent(userInfo._id, newStatus, null));
        submission.history = events;
        submission.updatedAt = getCurrentTime();
        if(!submission.rootPath)
            submission.rootPath = `${submission.organization._id}/${submission._id}`;
        
        //update submission status
        const res = await this.submissionCollection.update(submission);
        if (!(res?.acknowledged)) {
            throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
        }
        //to do: send email to user and cc related users.

        return submission;
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

//actions: NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED
const submissionActionMap = [
    {action:ACTIONS.SUBMIT, fromStatus: [IN_PROGRESS], 
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.CURATOR,ROLES.ADMIN], toStatus:SUBMITTED},
    {action:ACTIONS.RELEASE, fromStatus: [SUBMITTED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:RELEASED},
    {action:ACTIONS.WITHDRAW, fromStatus: [SUBMITTED], 
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER,], toStatus:WITHDRAWN},
    {action:ACTIONS.REJECT, fromStatus: [SUBMITTED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:REJECTED},
    {action:ACTIONS.COMPLETE, fromStatus: [RELEASED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:COMPLETED},
    {action:ACTIONS.CANCEL, fromStatus: [NEW,IN_PROGRESS], 
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.CURATOR,ROLES.ADMIN], toStatus:CANCELLED},
    {Action:ACTIONS.REJECT, fromStatus: [COMPLETED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:ARCHIVED}
]

module.exports = {
    Submission
};

