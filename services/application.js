const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW, DELETED} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTimeYYYYMMDDSS, subtractDaysFromNow} = require("../utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/user-info-verifier");
const ERROR = require("../constants/error-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;

class Application {
    constructor(applicationCollection, organizationService, userService, dbService, notificationsService, emailParams) {
        this.applicationCollection = applicationCollection;
        this.organizationService = organizationService;
        this.userService = userService;
        this.dbService = dbService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
    }

    async getApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        return await this.getApplicationById(params._id);
    }

    async getApplicationById(id) {
        let result = await this.applicationCollection.find(id);
        if (!result?.length || result.length < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return result[0];
    }

    async reviewApplication(params, context) {
        const application = await this.getApplication(params, context);
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        if (application && application.status && application.status === SUBMITTED) {
            // If Submitted status, change it to In Review
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, IN_REVIEW, null);
            const updated = await this.dbService.updateOne(APPLICATION, {_id: params._id}, {
                $set: {status: IN_REVIEW, updatedAt: history.dateTime},
                $push: {history}
            });
            const result = (updated?.modifiedCount && updated?.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: params._id}) : [];
            return result.length > 0 ? result[0] : null;
        }
        return application || null;
    }

    async createApplication(application, userInfo) {
        let newApplicationProperties = {
            _id: v4(undefined, undefined, undefined),
            status: IN_PROGRESS,
            applicant: {
                applicantID: userInfo._id,
                applicantName: userInfo.firstName + " " + userInfo.lastName,
                applicantEmail: userInfo.email
            },
            createdAt: application.updatedAt
        };
        application = {
            ...application,
            ...newApplicationProperties
        };
        await this.applicationCollection.insert(application);
        return application;
    }

    async saveApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        let application = params.application;
        application.updatedAt = getCurrentTimeYYYYMMDDSS();
        const id = application?._id;
        if (!id) return await this.createApplication(application, context.userInfo);
        const result = await this.applicationCollection.update(application);
        if (result.matchedCount < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return await this.getApplicationById(id);
    }

    async getMyLastApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userID = context.userInfo._id;
        const matchApplicantIDToUser = {"$match": {"applicant.applicantID": userID, status: APPROVED}};
        const sortCreatedAtDescending = {"$sort": {createdAt: -1}};
        const limitReturnToOneApplication = {"$limit": 1};
        const pipeline = [
            matchApplicantIDToUser,
            sortCreatedAtDescending,
            limitReturnToOneApplication
        ];
        const result = await this.applicationCollection.aggregate(pipeline);
        if (result.length < 1) throw new Error(ERROR.NO_USER_APPLICATIONS);
        return result[0];
    }

    listApplicationConditions(userID, organizations) {
        // search by applicant's user id
        let conditions = [{"applicant.applicantID": userID}];
        const orgIds = organizations
            .map((org) => org._id)
            .filter((org)=> (org));
        // search by user's organization
        if (orgIds?.length > 0) conditions.push({"organization._id": { "$in": orgIds }});
        return [{"$match": {"$or": conditions}}];
    }

    async listApplications(params, context) {
        verifySession(context)
            .verifyInitialized();
        let pipeline = [];
        if (!this.userService.isAdmin(context.userInfo.role)) {
            const organizations = await this.organizationService.getOrganizationByUserID(context.userInfo._id);
            pipeline = pipeline.concat(this.listApplicationConditions(context.userInfo._id, organizations));
        }
        if (params.orderBy) pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (params.offset) pipeline.push({"$skip": params.offset});

        const promises = [
            await this.applicationCollection.aggregate((!disablePagination) ? pipeline.concat([{"$limit": params.first}]) : pipeline),
            await this.applicationCollection.aggregate(pipeline)
        ];
        let result = {total: 0, applications: []};
        await Promise.all(promises).then(function(results) {
            result.applications = results[0] || [];
            result.total = results[1]?.length || 0;
        });
        return result;
    }

    async submitApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        let application = await this.getApplicationById(params._id);
        verifyApplication(application)
            .notEmpty()
            .state(IN_PROGRESS);
        // In Progress -> In Submitted
        const history = application.history || [];
        const historyEvent = HistoryEventBuilder.createEvent(context.userInfo._id, SUBMITTED, null);
        history.push(historyEvent)
        application = {
            ...application,
            history: history,
            status: SUBMITTED,
            updatedAt: historyEvent.dateTime,
            submittedDate: historyEvent.dateTime
        };
        const updated = await this.applicationCollection.update(application);
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) throw new Error(ERROR.UPDATE_FAILED);
        await this.sendEmailAfterSubmitApplication(context, application);
        return application;
    }

    async reopenApplication(document, context) {
        const application = await this.getApplicationById(document._id);
        // TODO 1. If Reviewer opened the application, the status changes to IN_REVIEW
        // TODO 2. THe application status changes from rejected to in-progress when the user opens the rejected application
        if (application && application.status) {
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, IN_PROGRESS, null);
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: IN_PROGRESS, updatedAt: history.dateTime},
                $push: {history}
            });
            const result = (updated?.modifiedCount && updated?.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : [];
            return result.length > 0 ? result[0] : {};
        }
        return application;
    }

    async deleteApplication(document, _) {
        const deletedOne = await this.getApplicationById(document._id);
        let result = null;
        if (deletedOne && await this.dbService.deleteOne(APPLICATION, {_id: document._id})) {
            result = deletedOne[0];
        }
        return result;
    }

    async approveApplication(document, context) {
        verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Approved
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, APPROVED, document.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, wholeProgram: document.wholeProgram, status: APPROVED, updatedAt: history.dateTime},
            $push: {history}
        });
        return updated?.modifiedCount && updated?.modifiedCount > 0 ? await this.getApplicationById(document._id) : null;
    }

    async rejectApplication(document, context) {
        verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Rejected
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, APPROVED, document.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
            $push: {history}
        });
        return updated?.modifiedCount && updated?.modifiedCount > 0 ? await this.getApplicationById(document._id) : null;
    }

    async deleteInactiveApplications(inactiveDays) {
        const inactiveCondition = {
            updatedAt: {
                $lt: subtractDaysFromNow(inactiveDays)
            },
            status: SUBMITTED
        };
        const applications = await this.applicationCollection.aggregate([{$match: inactiveCondition}]);
        verifyApplication(applications)
            .isUndefined();

        if (applications?.length > 0) {
            const history = HistoryEventBuilder.createEvent(0, DELETED, "Deleted because of no activities after submission");
            const updated = await this.dbService.updateMany(APPLICATION,
                inactiveCondition,
                {
                    $set: {status: DELETED, updatedAt: history.dateTime},
                    $push: {history}});
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTimeYYYYMMDDSS());
                await this.emailInactiveApplicants(applications);
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
            const emailsCCs = (orgOwners.hasOwnProperty(app.organization._id)) ? [orgOwners[app.organization._id]] : [];
            await this.sendEmailAfterInactiveApplications(app.applicant.applicantEmail, emailsCCs, app.applicant.applicantName, app);
        }));
    }

    // Email Notifications
    async sendEmailAfterSubmitApplication(context, application) {
        await this.notificationService.submitQuestionNotification(context.userInfo.email, {
            firstName: context.userInfo.firstName
        }, {
            pi: `${application?.pi?.firstName} ${application?.pi?.lastName}`,
            study: application?.study?.abbreviation,
            program: application?.program?.abbreviation,
            url: this.emailParams.url
        })
    }

    async sendEmailAfterInactiveApplications(email, emailCCs, firstName, application) {
        await this.notificationService.inactiveApplicationsNotification(email, emailCCs,{
            firstName: firstName
        },{
            pi: `${application?.pi?.firstName} ${application?.pi?.lastName}`,
            study: application?.study?.abbreviation,
            program: application?.program?.abbreviation,
            officialEmail: this.emailParams.officialEmail,
            inactiveDays: this.emailParams.inactiveDays,
            url: this.emailParams.url
        })
    }


}

function verifyReviewerPermission(context){
    verifySession(context)
        .verifyInitialized()
        .verifyRole([ROLES.ADMIN, ROLES.FEDERAL_LEAD]);
}

module.exports = {
    Application
};

