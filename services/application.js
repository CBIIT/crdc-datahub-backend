const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW, DELETED, NEW, INQUIRED} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
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
const {parseJsonString} = require("../crdc-datahub-database-drivers/utility/string-utility");
const {formatName} = require("../utility/format-name");

class Application {
    constructor(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, tier) {
        this.logCollection = logCollection;
        this.applicationCollection = applicationCollection;
        this.approvedStudiesService = approvedStudiesService;
        this.userService = userService;
        this.dbService = dbService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
        this.organizationService = organizationService;
        this.tier = tier;
    }

    async getApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const application = await this.getApplicationById(params._id);
        const isAdminOrFedLead = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD].includes(context.userInfo?.role);
        const isSubmitter = application?.applicant?.applicantID === context?.userInfo?._id;
        if (!isAdminOrFedLead && !isSubmitter){
            throw new Error(ERROR.INVALID_PERMISSION);
        }
        return application;
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
                    await this.getApplicationById(params._id),
                    this.logCollection.insert(
                        UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, IN_REVIEW)
                    )
                ];
                return await Promise.all(promises).then(function(results) {
                    return results[0];
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
                applicantName: formatName(userInfo),
                applicantEmail: userInfo.email
            },
            organization: {
                _id: userInfo?.organization?.orgID,
                name: userInfo?.organization?.orgName
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
        let inputApplication = params.application;
        inputApplication.updatedAt = getCurrentTime();
        const id = inputApplication?._id;
        if (!id) {
            return await this.createApplication(inputApplication, context.userInfo);
        }
        const storedApplication = await this.getApplicationById(id);
        const prevStatus = storedApplication?.status;
        let application = {...storedApplication, ...inputApplication, status: IN_PROGRESS};
        application = await updateApplication(this.applicationCollection, application, prevStatus, context?.userInfo?._id);
        if (prevStatus !== application.status){
            await logStateChange(this.logCollection, context.userInfo, application, prevStatus);
        }
        return application;
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

    listApplicationConditions(userID, userRole) {
        // list all applications
        const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, INQUIRED, REJECTED]}};
        const listAllApplicationRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD];
        if (listAllApplicationRoles.includes(userRole)) return [{"$match": {...validApplicationStatus}}];
        // search by applicant's user id
        let conditions = [{$and: [{"applicant.applicantID": userID}, validApplicationStatus]}];
        return [{"$match": {"$or": conditions}}];
    }

    async listApplications(params, context) {
        verifySession(context)
            .verifyInitialized();
        let pipeline = this.listApplicationConditions(context.userInfo._id, context.userInfo?.role);
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
                applications: (results[0] || []).map((app)=>(app)),
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
            await sendEmails.submitApplication(this.notificationService,this.emailParams,context, application)
        ]);
        return application;
    }

    async reopenApplication(document, context) {
        const application = await this.getApplicationById(document._id);
        // TODO 1. If Reviewer opened the application, the status changes to IN_REVIEW
        if (application && application.status) {
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, IN_PROGRESS, null);
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: IN_PROGRESS, updatedAt: history.dateTime},
                $push: {history}
            });
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                const promises = [
                    await this.getApplicationById(document._id),
                    await this.logCollection.insert(UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, IN_PROGRESS))
                ];
                return await Promise.all(promises).then(function(results) {
                    return results[0];
                });
            }
        }
        return application;
    }

    async deleteApplication(document, context) {
        // TODO Deleting the application requires permission control.
        const aApplication = await this.getApplicationById(document._id);
        const validApplicationStatus = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED, INQUIRED];
        if (validApplicationStatus.includes(aApplication.status)) {
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, DELETED, null);
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: DELETED, updatedAt: history.dateTime},
                $push: {history}
            });
            return (updated?.modifiedCount && updated?.modifiedCount > 0) ? await this.getApplicationById(document._id) : null;
        }
        return aApplication;
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
                await saveApprovedStudies(this.approvedStudiesService, this.organizationService, application),
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
        // In Reviewed or Submitted -> Inquired
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, REJECTED, document.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
            $push: {history}
        });
        await sendEmails.rejectApplication(this.notificationService, this.emailParams, context, application);
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

    async inquireApplication(document, context) {
        verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed or Submitted -> Inquired
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, INQUIRED, document.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, status: INQUIRED, updatedAt: history.dateTime},
            $push: {history}
        });
        // admin email CCs
        const adminEmails = (await this.userService.getAdmin())
            ?.filter((aUser) => aUser?.email)
            ?.map((aUser)=> aUser.email);
        await sendEmails.inquireApplication(this.notificationService, this.emailParams, context, application, adminEmails, this.tier);
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            const log = UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, INQUIRED);
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

    async deleteInactiveApplications() {
        const inactiveCondition = {
            updatedAt: {
                $lt: subtractDaysFromNow(this.emailParams.inactiveDays)
            },
            status: {$in: [NEW, IN_PROGRESS, INQUIRED]}
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
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTime());
                await Promise.all(applications.map(async (app) => {
                    await sendEmails.inactiveApplications(this.notificationService,this.emailParams, app?.applicant?.applicantEmail, app?.applicant?.applicantName, app);
                }));
                // log disabled applications
                await Promise.all(applications.map(async (app) => {
                    this.logCollection.insert(UpdateApplicationStateEvent.createByApp(app._id, app.status, DELETED));
                }));
            }
        }
    }

    async remindApplicationSubmission() {
        const inactiveDuration = this.emailParams.remindDay;
        const remindCondition = {
            updatedAt: {
                $lt: subtractDaysFromNow(inactiveDuration),
                $gt: subtractDaysFromNow(inactiveDuration + 1),
            },
            status: {$in: [NEW, IN_PROGRESS, INQUIRED]},
            inactiveReminder: {$ne: true}
        };
        const applications = await this.applicationCollection.aggregate([{$match: remindCondition}]);
        if (applications?.length > 0) {
            await Promise.all(applications.map(async (app) => {
                await sendEmails.remindApplication(this.notificationService, this.emailParams, app?.applicant?.applicantEmail, app?.applicant?.applicantName, app);
            }));
            const applicationIDs = applications.map(app => app._id);
            const query = {_id: {$in: applicationIDs}};
            const updatedReminder = await this.applicationCollection.updateMany(query, {inactiveReminder: true});
            if (!updatedReminder?.modifiedCount || updatedReminder?.modifiedCount === 0) {
                console.error("The email reminder flag intended to notify the inactive application user is not being stored");
            }
        }
    }

    async sendEmailAfterApproveApplication(context, application) {
        // org owner email
        let org_owner_email = ""
        let orgOwner = await this.userService.getOrgOwner(application?.organization?._id)
        for(let i of orgOwner){
            org_owner_email  += i.email + " ; "
        }
        // concierge email
        let concierge = await this.userService.getConcierge(application?.organization?._id)
        let concierge_email = ""
        for(let i of concierge){
            concierge_email += i.email + " ; "
        }
        // admin email
        let admin_user = await this.userService.getAdmin();
        let admin_email = ""
        for(let i of admin_user){
            admin_email += i.email + " ; "
        }
        // cc emil
        let cc_email
        if(concierge_email){
            cc_email = concierge_email
        }else{
            cc_email = admin_email
        }

        // contact detail
        let contact_detail = `either your organization ${org_owner_email} or your CRDC Data Team member ${concierge_email}.`
        if(!org_owner_email &&!concierge_email ){
            contact_detail = `the Submission Helpdesk ${this.emailParams.submissionHelpdesk}`
        } else if(!org_owner_email){
            contact_detail = `your CRDC Data Team member ${concierge_email}`
        } else if(!concierge_email){
            contact_detail = `either your organization ${org_owner_email} or the Submission Helpdesk ${this.emailParams.submissionHelpdesk}`
        }
        await this.notificationService.approveQuestionNotification(application?.applicant?.applicantEmail,
            // Organization Owner and concierge assigned/Super Admin
            `${org_owner_email} ${cc_email}`,
        {
            firstName: application?.applicant?.applicantName
        }, {
            study: application?.studyAbbreviation,
            doc_url: this.emailParams.url,
            contact_detail: contact_detail
        })
    }
}

function verifyReviewerPermission(context){
    verifySession(context)
        .verifyInitialized()
        .verifyRole([ROLES.ADMIN, ROLES.FEDERAL_LEAD]);
}

async function updateApplication(applicationCollection, application, prevStatus, userID) {
    if (prevStatus !== IN_PROGRESS) {
        application = {history: [], ...application};
        const historyEvent = HistoryEventBuilder.createEvent(userID, IN_PROGRESS, null);
        application.history.push(historyEvent);
    }
    // Save an email reminder when an inactive application is reactivated.
    application.inactiveReminder = false;
    const updateResult = await applicationCollection.update(application);
    if ((updateResult?.matchedCount || 0) < 1) {
        throw new Error(ERROR.APPLICATION_NOT_FOUND + application?._id);
    }
    return application;
}

async function logStateChange(logCollection, userInfo, application, prevStatus) {
    await logCollection.insert(
        UpdateApplicationStateEvent.create(
            userInfo?._id, userInfo?.email, userInfo?.IDP, application?._id, prevStatus, application?.status
        )
    );
}

const setDefaultIfNoName = (str) => {
    const name = str?.trim() ?? "";
    return (name.length > 0) ? (name) : "NA";
}

const sendEmails = {
    remindApplication: async (notificationService, emailParams, email, applicantName, application) => {
        await notificationService.remindApplicationsNotification(email, {
            firstName: applicantName
        },{
            study: setDefaultIfNoName(application?.studyAbbreviation),
            remindDay: emailParams.remindDay,
            differDay: emailParams.inactiveDays - emailParams.remindDay,
            url: emailParams.url
        });
    },
    inactiveApplications: async (notificationService, emailParams, email, applicantName, application) => {
        await notificationService.inactiveApplicationsNotification(email,{
            firstName: applicantName
        },{
            pi: `${applicantName}`,
            study: setDefaultIfNoName(application?.studyAbbreviation),
            officialEmail: emailParams.officialEmail,
            inactiveDays: emailParams.inactiveDays,
            url: emailParams.url
        })
    },
    submitApplication: async (notificationService, emailParams, context, application) => {
        const programName = application?.programName?.trim() ?? "";
        const associate = `the ${application?.studyAbbreviation} study` + (programName.length > 0 ? ` associated with the ${programName} program` : '');
        await notificationService.submitQuestionNotification({
            pi: `${context.userInfo.firstName} ${context.userInfo.lastName}`,
            associate,
            url: emailParams.url
        })
    },
    inquireApplication: async(notificationService, emailParams, context, application, emailCCs, tier) => {
        await notificationService.inquireQuestionNotification(application?.applicant?.applicantEmail, emailCCs,{
            firstName: application?.applicant?.applicantName
        }, {
            officialEmail: emailParams.submissionHelpdesk
        }, tier);
    },
    rejectApplication: async(notificationService, emailParams, context, application) => {
        await notificationService.rejectQuestionNotification(application?.applicant?.applicantEmail, {
            firstName: application?.applicant?.applicantName
        }, {
            study: application?.studyAbbreviation,
            url: emailParams.url
        });
    }
}

const saveApprovedStudies = async (approvedStudiesService, organizationService, aApplication) => {
    const questionnaire = parseJsonString(aApplication?.questionnaireData);
    if (!questionnaire) {
        console.error(ERROR.FAILED_STORE_APPROVED_STUDIES + ` id=${aApplication?._id}`);
        return;
    }
    // use study name when study abbreviation is not available
    const studyAbbreviation = !!aApplication?.studyAbbreviation?.trim() ? aApplication?.studyAbbreviation : questionnaire?.study?.name;
    await approvedStudiesService.storeApprovedStudies(
        questionnaire?.study?.name, studyAbbreviation, questionnaire?.study?.dbGaPPPHSNumber, aApplication?.organization?.name
    );
    await organizationService.storeApprovedStudies(aApplication?.organization?._id, questionnaire?.study?.name, studyAbbreviation);
}

module.exports = {
    Application
};
