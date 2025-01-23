const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW, DELETED, CANCELED, NEW, INQUIRED} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/user-info-verifier");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {CreateApplicationEvent, UpdateApplicationStateEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const ROLES = USER_CONSTANTS.USER.ROLES;
const {parseJsonString} = require("../crdc-datahub-database-drivers/utility/string-utility");
const {formatName} = require("../utility/format-name");
const {isUndefined, replaceErrorString} = require("../utility/string-util");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {EMAIL_NOTIFICATIONS} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");

class Application {
    #ALL_FILTER="All";
    constructor(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, institutionService) {
        this.logCollection = logCollection;
        this.applicationCollection = applicationCollection;
        this.approvedStudiesService = approvedStudiesService;
        this.userService = userService;
        this.dbService = dbService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
        this.organizationService = organizationService;
        this.institutionService = institutionService;
    }

    async getApplication(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
        let application = await this.getApplicationById(params._id);
        // add logics to check if conditional approval
        if (application.status === APPROVED){
            await this.#checkConditionalApproval(application);
        }
        return application;
    }

    async #checkConditionalApproval(application) {
        // 1) controlled study missing dbGaPID
        const study_arr = await this.approvedStudiesService.findByStudyName(application.studyName);
        if (!study_arr || study_arr.length < 1) {
            return;
        }
        const study = study_arr[0];
        if(study?.controlledAccess && !study?.dbGaPID){
            application.conditional = true;
            application.pendingConditions = (!application?.pendingConditions)? [ERROR.CONTROLLED_STUDY_NO_DBGAPID] : application.pendingConditions.push(CONTROLLED_STUDY_NO_DBGAPID);
        }
        else {
            application.conditional = false;
        }
    }

    async getApplicationById(id) {
        let result = await this.applicationCollection.find(id);
        if (!result?.length || result.length < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return result[0];
    }

    async reviewApplication(params, context) {
        verifyReviewerPermission(context);
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
        const timestamp = getCurrentTime();
        let newApplicationProperties = {
            _id: v4(undefined, undefined, undefined),
            status: NEW,
            controlledAccess: application?.controlledAccess,
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
            createdAt: timestamp,
            updatedAt: timestamp,
            programAbbreviation: application?.programAbbreviation,
            programDescription: application?.programDescription
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
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CREATE);
        let inputApplication = params.application;
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
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
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

    #listApplicationConditions(userID, userRole, programName, studyName, statues, submitterName) {
        const validApplicationStatus = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, INQUIRED, REJECTED, DELETED];
        const statusCondition = statues && !statues?.includes(this.#ALL_FILTER) ?
            { status: { $in: statues || [] } } : { status: { $in: validApplicationStatus } };
        // Allowing empty string SubmitterName, ProgramName, StudyName
        const submitterNameCondition = (submitterName != null && submitterName !== this.#ALL_FILTER) ? {"applicant.applicantName": submitterName} : {};
        const programNameCondition = (programName != null && programName !== this.#ALL_FILTER) ? {programName: programName} : {};
        const studyNameCondition = (studyName != null && studyName !== this.#ALL_FILTER) ? {studyName: studyName} : {};

        const baseConditions = {...statusCondition, ...programNameCondition, ...studyNameCondition, ...submitterNameCondition};
        return (() => {
            switch (userRole) {
                case ROLES.ADMIN:
                case ROLES.FEDERAL_LEAD:
                case ROLES.DATA_COMMONS_PERSONNEL:
                    return baseConditions;
                // Submitter/User
                default:
                    return {...baseConditions, "applicant.applicantID": userID};
            }
        })();
    }

    async listApplications(params, context) {
        let userInfoVerifier = verifySession(context)
            .verifyInitialized()
        try{
            userInfoVerifier.verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
        }
        catch(permissionError){
            console.warn(permissionError);
            console.warn("Failed permission verification for listApplications, returning empty list");
            return {applications: [], total: 0};
        }

        const userInfo = context?.userInfo;
        const validStatuesSet = new Set([NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, INQUIRED, REJECTED, DELETED, this.#ALL_FILTER]);
        const invalidStatues = (params?.statues || [])
            .filter((i) => !validStatuesSet.has(i));
        if (invalidStatues?.length > 0) {
            throw new Error(replaceErrorString(ERROR.APPLICATION_INVALID_STATUES, `'${invalidStatues.join(",")}'`));
        }


        const filterConditions = [
            // default filter for listing submissions
            this.#listApplicationConditions(userInfo?._id, userInfo?.role, params.programName, params.studyName, params.statues, params?.submitterName),
            // note: Aggregation of Program name should not be filtered by its name
            this.#listApplicationConditions(userInfo?._id, userInfo?.role, this.#ALL_FILTER, params.studyName, params.statues, params?.submitterName),
            // note: Aggregation of Study name should not be filtered by its name
            this.#listApplicationConditions(userInfo?._id, userInfo?.role, params.programName, this.#ALL_FILTER, params.statues, params?.submitterName),
            // note: Aggregation of Statues name should not be filtered by its name
            this.#listApplicationConditions(userInfo?._id, userInfo?.role, params.programName, params.studyName, this.#ALL_FILTER, params?.submitterName),
            // note: Aggregation of Submitter name should not be filtered by its name
            this.#listApplicationConditions(userInfo?._id, userInfo?.role, params.programName, params.studyName, params.statues, this.#ALL_FILTER),
        ];
        const [listConditions, programCondition, studyNameCondition, statuesCondition, submitterNameCondition] = filterConditions;
        let pipeline = [{"$match": listConditions}];
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const noPaginationPipe = pipeline.concat(paginationPipe.getNoLimitPipeline());

        const promises = [
            this.applicationCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            this.applicationCollection.aggregate(noPaginationPipe.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            // note: Program name filter is omitted
            this.applicationCollection.distinct("programName", programCondition),
            // note: Study name filter is omitted
            this.applicationCollection.distinct("studyName", studyNameCondition),
            // note: Statues filter is omitted
            this.applicationCollection.distinct("status", statuesCondition),
            // note: Submitter name filter is omitted
            this.applicationCollection.distinct("applicant.applicantName", submitterNameCondition)
        ];

        const results = await Promise.all(promises);
        const applications = (results[0] || []);
        for (let app of applications?.filter(a=>a.status === APPROVED)) {
            await this.#checkConditionalApproval(app);
        }

        return {
            applications: applications,
            total: results[1]?.length > 0 ? results[1][0]?.count : 0,
            programs: results[2] || [],
            studies: results[3] || [],
            status: results[4] || [],
            submitterNames: results[5] || []
        }
    }

    async submitApplication(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.SUBMIT);
        const application = await this.getApplicationById(params._id);
        const validStatus = [IN_PROGRESS, INQUIRED]; //updated based on new requirement.
        verifyApplication(application)
            .notEmpty()
            .state(validStatus);
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
            await sendEmails.submitApplication(this.notificationService, this.userService, this.emailParams, context.userInfo, application)
        ]);
        return application;
    }

    async reopenApplication(document, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CREATE);
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
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CANCEL);
        const aApplication = await this.getApplicationById(document._id);
        const validApplicationStatus = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, REJECTED, INQUIRED];
        if (!validApplicationStatus.includes(aApplication.status)) {
            throw new Error(ERROR.VERIFY.INVALID_STATE_APPLICATION);
        }

        const userInfo = context?.userInfo;
        const isEnabledPBAC = userInfo?.permissions?.includes(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CANCEL);
        const isPowerRole = [ROLES.FEDERAL_LEAD, ROLES.ADMIN, ROLES.DATA_COMMONS_PERSONNEL].includes(userInfo?.role);
        const powerUserCond = [NEW, IN_PROGRESS, INQUIRED, SUBMITTED, IN_REVIEW].includes(aApplication?.status) && isEnabledPBAC;

        const isNonPowerRole = [ROLES.USER, ROLES.SUBMITTER].includes(userInfo?.role);
        const isValidCond = [NEW, IN_PROGRESS, INQUIRED].includes(aApplication?.status) && userInfo?._id === aApplication?.applicant?.applicantID;

        if ((isPowerRole && !powerUserCond) || (isNonPowerRole && !isValidCond)) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const history = HistoryEventBuilder.createEvent(context.userInfo._id, CANCELED, null);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {status: CANCELED, updatedAt: history.dateTime},
            $push: {history}
        });

        if (!updated?.modifiedCount || !updated?.modifiedCount > 0) {
            console.error(ERROR.FAILED_DELETE_APPLICATION, `${document._id}`);
            throw new Error(ERROR.FAILED_DELETE_APPLICATION);
        }
        return await this.getApplicationById(document._id);
    }

    async approveApplication(document, context) {
        verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Approved
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);

        const approvedStudies = await this.approvedStudiesService.findByStudyName(application?.studyName);
        if (approvedStudies.length > 0) {
            throw new Error(replaceErrorString(ERROR.DUPLICATE_APPROVED_STUDY_NAME, `'${application?.studyName}'`));
        }

        const history = HistoryEventBuilder.createEvent(context.userInfo._id, APPROVED, document.comment);
        const questionnaire = getApplicationQuestionnaire(application);
        const approvalConditional = (questionnaire?.accessTypes?.includes("Controlled Access") && !questionnaire?.study?.dbGaPPPHSNumber);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, wholeProgram: document.wholeProgram, status: APPROVED, updatedAt: history.dateTime},
            $push: {history}
        });

        let promises = [];
        promises.push(this.institutionService.addNewInstitutions(document?.institutions));
        promises.push(this.sendEmailAfterApproveApplication(context, application, document?.comment, approvalConditional));
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            promises.unshift(this.getApplicationById(document._id));
            if(questionnaire) {
                const approvedStudies = await saveApprovedStudies(this.approvedStudiesService, this.organizationService, application, questionnaire);
                // added approved studies into user collection
                const { _id, ...updateUser } = context?.userInfo || {};
                const currStudyIDs = context?.userInfo?.studies?.map((study)=> study?._id) || [];
                const newStudiesIDs = [approvedStudies?._id].concat(currStudyIDs);
                promises.push(this.userService.updateUserInfo(
                    context?.userInfo, updateUser, _id, context?.userInfo?.userStatus, context?.userInfo?.role, newStudiesIDs));

                const [name, abbreviation, description] = [application?.programName, application?.programAbbreviation, application?.programDescription];
                if (name?.trim()?.length > 0) {
                    const programs = await this.organizationService.findOneByProgramName(name);
                    if (programs?.length === 0) {
                        promises.push(this.organizationService.upsertByProgramName(name, abbreviation, description, [approvedStudies]));
                    }
                }
            }
            promises.push(this.logCollection.insert(
                UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, APPROVED)
            ));
        }
        return await Promise.all(promises).then(results => {
            return results[0];
        })
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

        await sendEmails.rejectApplication(this.notificationService, this.userService, this.emailParams, application, document.comment);
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
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, INQUIRED, document?.comment);
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document?.comment, status: INQUIRED, updatedAt: history.dateTime},
            $push: {history}
        });
        await sendEmails.inquireApplication(this.notificationService, this.userService, this.emailParams, application, document?.comment);
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
            const applicantUsers = await this.#findUsersByApplicantIDs(applications);
            const permittedUserIDs = new Set(
                applicantUsers
                    ?.filter((u) => u?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_DELETE))
                    ?.map((u) => u?._id)
            );
            const history = HistoryEventBuilder.createEvent(0, DELETED, "Deleted because of no activities after submission");
            const updated = await this.dbService.updateMany(APPLICATION,
                inactiveCondition,
                {
                    $set: {status: DELETED, updatedAt: history.dateTime},
                    $push: {history}});
            if (updated?.modifiedCount && updated?.modifiedCount > 0) {
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTime());
                await Promise.all(applications.map(async (app) => {
                    if (permittedUserIDs.has(app?.applicant?.applicantID)) {
                        await sendEmails.inactiveApplications(this.notificationService,this.emailParams, app?.applicant?.applicantEmail, app?.applicant?.applicantName, app);
                    }
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
                $lt: subtractDaysFromNow(inactiveDuration)
            },
            status: {$in: [NEW, IN_PROGRESS, INQUIRED]},
            inactiveReminder: {$ne: true}
        };
        const applications = await this.applicationCollection.aggregate([{$match: remindCondition}]);
        if (applications?.length > 0) {
            const applicantUsers = await this.#findUsersByApplicantIDs(applications);
            const permittedUserIDs = new Set(
                applicantUsers
                    ?.filter((u) => u?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_EXPIRING))
                    ?.map((u) => u?._id)
            );
            await Promise.all(applications.map(async (app) => {
                if (permittedUserIDs.has(app?.applicant?.applicantID)) {
                    await sendEmails.remindApplication(this.notificationService, this.emailParams, app?.applicant?.applicantEmail, app?.applicant?.applicantName, app);
                }
            }));
            const applicationIDs = applications.map(app => app._id);
            const query = {_id: {$in: applicationIDs}};
            const updatedReminder = await this.applicationCollection.updateMany(query, {inactiveReminder: true});
            if (!updatedReminder?.modifiedCount || updatedReminder?.modifiedCount === 0) {
                console.error("The email reminder flag intended to notify the inactive application user is not being stored");
            }
        }
    }

    async #findUsersByApplicantIDs(applications) {
        const applicantIDs = applications
            ?.map((a) => a?.applicant?.applicantID) // Extract applicant IDs
            ?.filter(Boolean);

        return await this.userService.userCollection.aggregate([{
            "$match": {"_id": { "$in": applicantIDs }
            }}]);
    }

    async sendEmailAfterApproveApplication(context, application, comment, conditional = false) {
        const res = await Promise.all([
            this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW],
                [ROLES.ADMIN, ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD]),
            this.userService.userCollection.find(application?.applicant?.applicantID)
        ]);

        const [toBCCUsers, applicant] = res;
        const applicantInfo = applicant?.pop();
        const toBCCEmails = getUserEmails(toBCCUsers);
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW)) {
            if (!conditional) {
                await this.notificationService.approveQuestionNotification(application?.applicant?.applicantEmail,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        reviewComments: comment
                    },
                    {
                        study: application?.studyAbbreviation,
                        contactEmail: this.emailParams.conditionalSubmissionContact
                });
                return;
            }
            await this.notificationService.conditionalApproveQuestionNotification(application?.applicant?.applicantEmail,
                toBCCEmails,
                {
                    firstName: application?.applicant?.applicantName,
                    contactEmail: this.emailParams?.conditionalSubmissionContact,
                    reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A"
                },
                {study: setDefaultIfNoName(application?.studyName)}
            );
        }
    }
}

function verifyReviewerPermission(context){
    verifySession(context)
        .verifyInitialized()
        .verifyPermission(USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.REVIEW);
}

async function updateApplication(applicationCollection, application, prevStatus, userID) {
    if (prevStatus !== IN_PROGRESS) {
        application = {history: [], ...application};
        const historyEvent = HistoryEventBuilder.createEvent(userID, IN_PROGRESS, null);
        application.history.push(historyEvent);
    }
    // Save an email reminder when an inactive application is reactivated.
    application.inactiveReminder = false;
    application.updatedAt = getCurrentTime();
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
    submitApplication: async (notificationService, userService, emailParams, userInfo, application) => {
        const applicantInfo = (await userService.userCollection.find(application?.applicant?.applicantID))?.pop();
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_SUBMIT)) {
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_SUBMIT],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);

            await notificationService.submitRequestReceivedNotification(application?.applicant?.applicantEmail,
                getUserEmails(BCCUsers),
                {helpDesk: emailParams.conditionalSubmissionContact},
                {userName: application?.applicant?.applicantName}
            );
        }

        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW)) {
            const toUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW],
                [ROLES.FEDERAL_LEAD]);
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW],
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);

            if (!toUsers || toUsers?.length === 0) {
                console.log("SR for Submit email notification does not have any recipient", `Application ID: ${application?._id}`);
                return;
            }

            await notificationService.submitQuestionNotification(getUserEmails(toUsers), getUserEmails(BCCUsers), {
                pi: `${userInfo.firstName} ${userInfo.lastName}`,
                programName: application?.programName?.trim() || "NA",
                study: application?.studyAbbreviation || "NA",
                url: emailParams.url
            });
        }
    },
    inquireApplication: async(notificationService, userService, emailParams, application, reviewComments) => {
        const res = await Promise.all([
            userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW],
                [ROLES.ADMIN, ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD]),
            userService.userCollection.find(application?.applicant?.applicantID)
        ]);
        const [toBCCUsers, applicant] = res;
        const applicantInfo = (applicant)?.pop();
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW)) {
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW],
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);
            await notificationService.inquireQuestionNotification(application?.applicant?.applicantEmail, getUserEmails(toBCCUsers),{
                firstName: application?.applicant?.applicantName,
                reviewComments,
            }, {
                contactInfo: emailParams.conditionalSubmissionContact,
            });
        }
    },
    rejectApplication: async(notificationService, userService, emailParams, application, reviewComments) => {
        const applicantInfo = (await userService.userCollection.find(application?.applicant?.applicantID))?.pop();
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW)) {
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW],
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);
            await notificationService.rejectQuestionNotification(application?.applicant?.applicantEmail, getUserEmails(BCCUsers), {
                firstName: application?.applicant?.applicantName,
                reviewComments
            }, {
                study: application?.studyAbbreviation
            });
        }
    }
}

const saveApprovedStudies = async (approvedStudiesService, organizationService, aApplication, questionnaire) => {
    // use study name when study abbreviation is not available
    const studyAbbreviation = !!aApplication?.studyAbbreviation?.trim() ? aApplication?.studyAbbreviation : questionnaire?.study?.name;
    const controlledAccess = aApplication?.controlledAccess;
    if (isUndefined(controlledAccess)) {
        console.error(ERROR.APPLICATION_CONTROLLED_ACCESS_NOT_FOUND, ` id=${aApplication?._id}`);
    }
    const savedApprovedStudy = await approvedStudiesService.storeApprovedStudies(
        aApplication?.studyName, studyAbbreviation, questionnaire?.study?.dbGaPPPHSNumber, aApplication?.organization?.name, controlledAccess, aApplication?.ORCID,
        aApplication?.PI, aApplication?.openAccess, aApplication.programName
    );

    await organizationService.storeApprovedStudies(aApplication?.organization?._id, savedApprovedStudy?._id);
    return savedApprovedStudy;
}

const getUserEmails = (users) => {
    return users
        ?.filter((aUser) => aUser?.email)
        ?.map((aUser)=> aUser.email);
}

const getApplicationQuestionnaire = (aApplication) => {
    const questionnaire = parseJsonString(aApplication?.questionnaireData);
    if (!questionnaire) {
        console.error(ERROR.FAILED_STORE_APPROVED_STUDIES + ` id=${aApplication?._id}`);
        return null;
    }
    return questionnaire;
}

module.exports = {
    Application
};
