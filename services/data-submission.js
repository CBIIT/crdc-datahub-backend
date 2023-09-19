const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED} = require("../constants/data-submission-constants");
const {DATA_SUBMISSIONS_COLLECTION: DATA_SUBMISSION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/user-info-verifier");
const ERROR = require("../constants/error-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {CreateApplicationEvent, UpdateApplicationStateEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const ROLES = USER_CONSTANTS.USER.ROLES;

class DataSubmission {
    constructor(logCollection, dataSubmissionCollection, organizationService, userService, dbService, notificationsService, emailParams) {
        this.logCollection = logCollection;
        this.dataSubmissionCollection = dataSubmissionCollection;
        this.organizationService = organizationService;
        this.userService = userService;
        this.dbService = dbService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
    }

    async getDataSubmission(params, context) {
        verifySession(context)
            .verifyInitialized();
        return await this.getApplicationById(params._id);
    }

    async getDataSubmissionById(id) {
        let result = await this.dataSubmissionCollection.find(id);
        if (!result?.length || result.length < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return result[0];
    }


    async createDataSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER]);
        let dataSubmission=params.dataSubmission;
        let userInfo = context.userInfo;
        let newApplicationProperties = {
            _id: v4(undefined, undefined, undefined),
            displayID: "000001", // minimum 6 digit integer with leading zeros, can have more digits
            name: params.name,
            submitterID: userInfo._id,
            submitterName: formatApplicantName(userInfo),
            organization: "todo: get from database",
            dataCommons: "CDS",
            modelVersion: "string for future use",
            studyAbbreviation: params.studyAbbreviation,
            dbGapID: params.dbGapID,
            bucketName: "todo: get from database",
            rootPath: "todo: organization/study?",
            status: NEW,
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            concierge: "todo: get from database?",
            createdAt: getCurrentTime(),
            updatedAt: getCurrentTime()
        };

        dataSubmission = {
            ...dataSubmission,
            ...newApplicationProperties
        };
        const res = await this.dataSubmissionCollection.insert(dataSubmission);
        // if (res?.acknowledged) await this.logCollection.insert(CreateApplicationEvent.create(userInfo._id, userInfo.email, userInfo.IDP, dataSubmission._id));
        return dataSubmission;
    }

    async saveApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        let application = params.application;
        application.updatedAt = getCurrentTime();
        const id = application?._id;
        if (!id) return await this.createApplication(application, context.userInfo);
        const aApplication = await this.getApplicationById(id);
        const option = aApplication && aApplication.status !== IN_PROGRESS ? {$push: { history: HistoryEventBuilder.createEvent(context.userInfo._id, IN_PROGRESS, null)}}: null;
        const result = await this.applicationCollection.update({...application, status: IN_PROGRESS}, option);
        if (result.matchedCount < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return await this.getApplicationById(id);
    }


    listApplicationConditions(userID, userRole, aUserOrganization) {
        // list all applications
        const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED]}};
        const listAllApplicationRoles = [USER.ROLES.ADMIN,USER.ROLES.FEDERAL_LEAD, USER.ROLES.CURATOR, USER.ROLES.DC_POC];
        if (listAllApplicationRoles.includes(userRole)) return [{"$match": {...validApplicationStatus}}];
        // search by applicant's user id
        let conditions = [{$and: [{"applicant.applicantID": userID}, validApplicationStatus]}];
        // search by user's organization
        if (userRole === USER.ROLES.ORG_OWNER && aUserOrganization?.orgID) {
            conditions.push({$and: [{"organization._id": aUserOrganization.orgID}, validApplicationStatus]})
        }
        return [{"$match": {"$or": conditions}}];
    }

    async listDataSubmissions(params, context) {
        verifySession(context)
            .verifyInitialized();
        // let pipeline = this.listApplicationConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization);
        let pipeline = [];
        if (params.orderBy) pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });

        const pagination = [];
        if (params.offset) pagination.push({"$skip": params.offset});
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (!disablePagination) {
            pagination.push({"$limit": params.first});
        }

        const promises = [
            await this.dataSubmissionCollection.aggregate((!disablePagination) ? pipeline.concat(pagination) : pipeline),
            await this.dataSubmissionCollection.aggregate(pipeline)
        ];

        return await Promise.all(promises).then(function(results) {
            console.log(results[0]);
            return {
                submissons: results[0] || [],
                total: results[1]?.length || 0
            }
        });
    }

    // async submitApplication(params, context) {
    //     verifySession(context)
    //         .verifyInitialized();
    //     const application = await this.getApplicationById(params._id);
    //     verifyApplication(application)
    //         .notEmpty()
    //         .state([NEW, IN_PROGRESS]);
    //     // In Progress -> In Submitted
    //     const history = application.history || [];
    //     const historyEvent = HistoryEventBuilder.createEvent(context.userInfo._id, SUBMITTED, null);
    //     history.push(historyEvent)
    //     const aApplication = {
    //         ...application,
    //         history: history,
    //         status: SUBMITTED,
    //         updatedAt: historyEvent.dateTime,
    //         submittedDate: historyEvent.dateTime
    //     };
    //     const updated = await this.applicationCollection.update(aApplication);
    //     if (!updated?.modifiedCount || updated?.modifiedCount < 1) throw new Error(ERROR.UPDATE_FAILED);
    //     const logEvent = UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, SUBMITTED);
    //     await Promise.all([
    //         await this.logCollection.insert(logEvent),
    //         await this.sendEmailAfterSubmitApplication(context, application)
    //     ]);
    //     return application;
    // }

    async deleteApplication(document, _) {
        const deletedOne = await this.getApplicationById(document._id);
        let result = null;
        if (deletedOne && await this.dbService.deleteOne(DATA_SUBMISSION, {_id: document._id})) {
            result = deletedOne[0];
            // TODO update application status and log events
        }
        return result;
    }



    async deleteInactiveApplications(inactiveDays) {
        const inactiveCondition = {
            updatedAt: {
                $lt: subtractDaysFromNow(inactiveDays)
            },
            status: {$in: [NEW, IN_PROGRESS, REJECTED]}
        };
        const applications = await this.applicationCollection.aggregate([{$match: inactiveCondition}]);
        verifyApplication(applications)
            .isUndefined();

        if (applications?.length > 0) {
            const history = HistoryEventBuilder.createEvent(0, DELETED, "Deleted because of no activities after submission");
            const updated = await this.dbService.updateMany(DATA_SUBMISSION,
                inactiveCondition,
                {
                    $set: {status: DELETED, updatedAt: history.dateTime},
                    $push: {history}});
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTime());
                await this.emailInactiveApplicants(applications);
                // log disabled applications
                await Promise.all(applications.map(async (app) => {
                    this.logCollection.insert(UpdateApplicationStateEvent.createByApp(app._id, app.status, DELETED));
                }));
            }
        }
    }

    async emailInactiveApplicants(applications) {
        // Store Owner's User IDs
        let ownerIDsSet = new Set();
        let userByOrgID = {};
        await Promise.all(applications.map(async (app) => {
            if (!app?.organization?._id) return [];
            const org = await this.organizationService.getOrganizationByID(app.organization._id);
            // exclude if user is already the owner's of the organization
            if (org?.owner && !ownerIDsSet.has(org.owner) && app.applicant.applicantID !== org.owner) {
                userByOrgID[org._id] = org.owner;
                ownerIDsSet.add(org.owner);
            }
        }));
        // Store Owner's email address
        const orgOwners = {};
        await Promise.all(
            Object.keys(userByOrgID).map(async (orgID) => {
                const user = await this.userService.getUser(userByOrgID[orgID]);
                if (user) orgOwners[orgID] = user.email;
            })
        );
        // Send Email Notification
        await Promise.all(applications.map(async (app) => {
            const emailsCCs = (orgOwners.hasOwnProperty(app?.organization?._id)) ? [orgOwners[app?.organization?._id]] : [];
            await this.sendEmailAfterInactiveApplications(app?.applicant?.applicantEmail, emailsCCs, app?.applicant?.applicantName, app);
        }));
    }

    // Email Notifications
    async sendEmailAfterSubmitApplication(context, application) {
        const programName = application?.programName?.trim() ?? "";
        const associate = `the ${application?.studyAbbreviation} study` + (programName.length > 0 ? ` associated with the ${programName} program` : '');
        await this.notificationService.submitQuestionNotification({
            pi: `${context.userInfo.firstName} ${context.userInfo.lastName}`,
            associate,
            url: this.emailParams.url
        })
    }

    async sendEmailAfterInactiveApplications(email, emailCCs, applicantName, application) {
        await this.notificationService.inactiveApplicationsNotification(email, emailCCs,{
            firstName: applicantName
        },{
            pi: `${applicantName}`,
            study: application?.studyAbbreviation,
            officialEmail: this.emailParams.officialEmail,
            inactiveDays: this.emailParams.inactiveDays,
            url: this.emailParams.url
        })
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
    DataSubmission
};

