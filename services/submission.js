const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession} = require("../verifier/user-info-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {formatName} = require("../utility/format-name");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";

// TODO: Data commons needs to be in a predefined list, currently only "CDS" is allowed
const dataCommonsTempList = ["CDS"];

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
    if (!dataCommonsTempList.some((value) => value === params.dataCommons)) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_DATA_COMMONS);
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
    constructor(logCollection, submissionCollection, organizationCollection) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.organizationCollection = organizationCollection;
    }

    async createSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER]);
        validateCreateSubmissionParams(params);
        const userInfo = context.userInfo;
        if (!userInfo.organization) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED);
        }
        const userOrgObject = await this.organizationCollection.aggregate([{ "$match": {"name": userInfo.organization.orgName}}]);
        const orgApprovedStudies = userOrgObject[0].studies;
        if (!orgApprovedStudies.some((study) => study.studyAbbreviation === params.studyAbbreviation)) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }
        const submissionID = v4();
        const newSubmission = {
            _id: submissionID,
            name: params.name,
            submitterID: userInfo._id,
            submitterName: formatName(userInfo),
            organization: {_id: userInfo?.organization?.orgID, name: userInfo?.organization?.orgName},
            dataCommons: params.dataCommons,
            modelVersion: "string for future use",
            studyAbbreviation: params.studyAbbreviation,
            dbGaPID: params.dbGaPID,
            bucketName: userOrgObject[0].bucketName,
            rootPath: userOrgObject[0].rootPath.concat(`/${submissionID}`),
            status: NEW,
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            concierge: userOrgObject[0].conciergeName,
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


}

module.exports = {
    Submission
};

