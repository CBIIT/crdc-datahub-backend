const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession} = require("../verifier/user-info-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";



function listConditions(userID, userRole, aUserOrganization, params){
    const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED]}};
    // Default conditons are:
    // Make sure application has valid status
    let conditions = [{$and: [validApplicationStatus]}];
    
    // Filter on organization and status
    if (params.organization !== ALL_FILTER) {
        conditions[0].$and.push({"organization.name": params.organization});
    }
    if (params.status !== ALL_FILTER) {
        conditions[0].$and.push({status: params.status});
    }
    // List all applications if Fed Lead / Admin / Data Concierge / Data Curator
    const listAllApplicationRoles = [ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.DC_POC];
    if (listAllApplicationRoles.includes(userRole)) {
        return [{"$match": {"$or": conditions}}];
    }
    // If org owner, add condition to return all data submissions associated with their organization
    if (userRole === ROLES.ORG_OWNER && aUserOrganization?.orgID) {
        conditions[0].$and.push({"organization.name": aUserOrganization.orgName});
        return [{"$match": {"$or": conditions}}];
    }

    // Add condition so submitters will only see their data submissions
    // User's cant make submissions, so they will always have no submissions 
    // search by applicant's user id
    conditions[0].$and.push({"submitterID": userID});

    return [{"$match": {"$or": conditions}}];
};

class Submission {
    constructor(logCollection, submissionCollection, organizationService, userService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.organizationService = organizationService;
        this.userService = userService;
    }

    async createSubmission(params, context) {
        // TODO: Add this requirement: Study abbreviation must have an approved application within user's organization
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER]);
        let submission = params.submission;
        const userInfo = context.userInfo;
        let newApplicationProperties = {
            _id: v4(),
            name: params.name,
            submitterID: userInfo._id,
            submitterName: formatApplicantName(userInfo),
            organization: {_id: userInfo.organization.orgID, name: userInfo.organization.orgName},
            dataCommons: "CDS",
            modelVersion: "string for future use",
            studyAbbreviation: params.studyAbbreviation,
            dbGapID: params.dbGapID,
            // TODO: get bucket name, and rootPath from organization database
            bucketName: "get from database",
            rootPath: "organization/study?",
            status: NEW,
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            // TODO: get conceirge data from organization database
            concierge: "get from organization database?",
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime()
        };

        submission = {
            ...submission,
            ...newApplicationProperties
        };
        const res = await this.submissionCollection.insert(submission);
        return submission;
    }

    async listSubmissions(params, context) {
        verifySession(context)
            .verifyInitialized();
        let pipeline = listConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization, params);
        // let pipeline = [];
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

function formatApplicantName(userInfo){
    if (!userInfo) return "";
    let firstName = userInfo?.firstName || "";
    let lastName = userInfo?.lastName || "";
    lastName = lastName.trim();
    return firstName + (lastName.length > 0 ? " "+lastName : "");
}

module.exports = {
    Submission
};

