const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW, DELETED, NEW} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTimeYYYYMMDDSS, subtractDaysFromNow} = require("../utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/user-info-verifier");
const ERROR = require("../constants/error-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {CreateApplicationEvent, UpdateApplicationStateEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const ROLES = USER_CONSTANTS.USER.ROLES;
const config = require('../config');

class Application {
    constructor(logCollection, applicationCollection, organizationService, userService, dbService, notificationsService, emailParams) {
        this.logCollection = logCollection;
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
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                const promises = [
                    await this.dbService.find(APPLICATION, {_id: params._id}),
                    this.logCollection.insert(
                        UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, IN_REVIEW)
                    )
                ];
                return await Promise.all(promises).then(function(results) {
                    const result = results[0];
                    return result.length > 0 ? result[0] : null;
                });
            }
        }
        return application || null;
    }

    async createApplication(application, userInfo) {
        let newApplicationProperties = {
            _id: v4(undefined, undefined, undefined),
            status: NEW,
            applicant: {
                applicantID: userInfo._id,
                applicantName: formatApplicantName(userInfo),
                applicantEmail: userInfo.email
            },
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            createdAt: application.updatedAt
        };
        application = {
            ...application,
            ...newApplicationProperties
        };
        const res = await this.applicationCollection.insert(application);
        if (res?.acknowledged) await this.logCollection.insert(CreateApplicationEvent.create(userInfo._id, userInfo.email, userInfo.IDP, application._id));
        return application;
    }

    async saveApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        let application = params.application;
        application.updatedAt = getCurrentTimeYYYYMMDDSS();
        const id = application?._id;
        if (!id) return await this.createApplication(application, context.userInfo);
        const aApplication = await this.getApplicationById(id);
        const option = aApplication && aApplication.status !== IN_PROGRESS ? {$push: { history: HistoryEventBuilder.createEvent(context.userInfo._id, IN_PROGRESS, null)}}: null;
        const result = await this.applicationCollection.update({...application, status: IN_PROGRESS}, option);
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
        return result.length > 0 ? result[0] : null;
    }

    listApplicationConditions(userID, userRole, aUserOrganization) {
        // list all applications
        const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED]}};
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

    async listApplications(params, context) {
        verifySession(context)
            .verifyInitialized();
        let pipeline = this.listApplicationConditions(context.userInfo._id, context.userInfo?.role, context.userInfo?.organization);
        if (params.orderBy) pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });

        const pagination = [];
        if (params.offset) pagination.push({"$skip": params.offset});
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (!disablePagination) {
            pagination.push({"$limit": params.first});
        }
        const promises = [
            await this.applicationCollection.aggregate((!disablePagination) ? pipeline.concat(pagination) : pipeline),
            await this.applicationCollection.aggregate(pipeline)
        ];

        return await Promise.all(promises).then(function(results) {
            return {
                applications: results[0] || [],
                total: results[1]?.length || 0
            }
        });
    }

    async submitApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const application = await this.getApplicationById(params._id);
        verifyApplication(application)
            .notEmpty()
            .state([NEW, IN_PROGRESS]);
        // In Progress -> In Submitted
        const history = application.history || [];
        const historyEvent = HistoryEventBuilder.createEvent(context.userInfo._id, SUBMITTED, null);
        history.push(historyEvent)
        const aApplication = {
            ...application,
            history: history,
            status: SUBMITTED,
            updatedAt: historyEvent.dateTime,
            submittedDate: historyEvent.dateTime
        };
        const updated = await this.applicationCollection.update(aApplication);
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) throw new Error(ERROR.UPDATE_FAILED);
        const logEvent = UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, SUBMITTED);
        await Promise.all([
            await this.logCollection.insert(logEvent),
            await this.sendEmailAfterSubmitApplication(context, application)
        ]);
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
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                const promises = [
                    await this.dbService.find(APPLICATION, {_id: document._id}),
                    await this.logCollection.insert(UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, IN_PROGRESS))
                ];
                return await Promise.all(promises).then(function(results) {
                    const result = results[0];
                    return result.length > 0 ? result[0] : {};
                });
            }
        }
        return application;
    }

    async deleteApplication(document, _) {
        const deletedOne = await this.getApplicationById(document._id);
        let result = null;
        if (deletedOne && await this.dbService.deleteOne(APPLICATION, {_id: document._id})) {
            result = deletedOne[0];
            // TODO update application status and log events
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
        await this.sendEmailAfterApproveApplication(context, application);
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            const promises = [
                await this.getApplicationById(document._id),
                this.logCollection.insert(
                    UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, APPROVED)
                )
            ];
            return await Promise.all(promises).then(function(results) {
                return results[0];
            });
        }
        return null;
    }

    async rejectApplication(document, context) {
        verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Rejected
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, REJECTED, document.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
            $push: {history}
        });
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            const log = UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, REJECTED);
            const promises = [
                await this.getApplicationById(document._id),
                this.logCollection.insert(log)
            ];
            return await Promise.all(promises).then(function(results) {
                return results[0];
            });
        }
        return null;
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
            const updated = await this.dbService.updateMany(APPLICATION,
                inactiveCondition,
                {
                    $set: {status: DELETED, updatedAt: history.dateTime},
                    $push: {history}});
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTimeYYYYMMDDSS());
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

    async sendEmailAfterApproveApplication(context, application) {
        // org owner email
        let org = await this.organizationService.getOrganizationByID(application?.organization?._id);
        let org_owner_email = null
        let org_owner_id = org?.owner
        if(org_owner_id){
            let org_owner = await this.userService.getUserByID(org_owner_id);
            if(org_owner?.email){
                org_owner_email = org_owner?.email
            }
        }

        // concierge email
        let concierge_email = null
        let org_concierge_id = org?.concierges
        if(org_concierge_id){
            let org_concierge = await this.userService.getUserByID(org_concierge_id);
            if(org_concierge?.email){
                concierge_email = org_concierge?.email
            }

        }
        
        // admin email
        let admin_user = await this.userService.getAdmin();
        let admin_email = ""

        for(let i of admin_user){
            admin_email = admin_email + " ; " + i.email
        }

        // cc emil
        let cc_email
        if(!concierge_email){
            cc_email = concierge_email
        }else{
            cc_email = admin_email
        }


        await this.notificationService.approveQuestionNotification(application?.applicant?.applicantEmail,
            // Organization Owner and concierge assigned/Super Admin
            `${org_owner_email} ; ${cc_email}`,
        {
            firstName: application?.applicant?.applicantName
        }, {
            study: application?.studyAbbreviation,
            doc_url: config.submission_doc_url,
            org_owner_email: org_owner_email,
            concierge_email: concierge_email
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

function verifyReviewerPermission(context){
    verifySession(context)
        .verifyInitialized()
        .verifyRole([ROLES.ADMIN, ROLES.FEDERAL_LEAD]);
}

module.exports = {
    Application
};

