const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW, DELETED, CANCELED, NEW, INQUIRED} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/user-info-verifier");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {CreateApplicationEvent, UpdateApplicationStateEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const ROLES = USER_CONSTANTS.USER.ROLES;
const {parseJsonString, isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const {formatName} = require("../utility/format-name");
const {isUndefined, replaceErrorString} = require("../utility/string-util");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {EMAIL_NOTIFICATIONS} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {UserScope} = require("../domain/user-scope");
const {UtilityService} = require("../services/utility");
const InstitutionDAO = require("../dao/institution");
const ApplicationDAO = require("../dao/application");
const {SORT: SORT_ORDER} = require("../constants/db-constants");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INSTITUTION_NAME_LENGTH = 100;
const OrderByMap = {
    "Submitter Name": "applicant.applicantName",
    "Organization": "organization.name",
    "Study": "studyName",
    "Program": "programName",
    "Status": "status",
    "Submitted Date": "submittedDate"
};
class Application {
    _DELETE_REVIEW_COMMENT="This Submission Request has been deleted by the system due to inactivity.";
    _ALL_FILTER="All";
    _FINAL_INACTIVE_REMINDER = "finalInactiveReminder";
    _INACTIVE_REMINDER = "inactiveReminder";
    _CRDC_TEAM = "the CRDC team";
    constructor(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, institutionService, configurationService, authorizationService) {
        this.logCollection = logCollection;
        this.approvedStudiesService = approvedStudiesService;
        this.userService = userService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
        this.organizationService = organizationService;
        this.institutionService = institutionService;
        this.configurationService = configurationService;
        this.authorizationService = authorizationService;
        this.institionDAO = new InstitutionDAO()
        this.applicationDAO = new ApplicationDAO();
    }

    async getApplication(params, context) {
        verifySession(context)
            .verifyInitialized()
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        let application = await this.getApplicationById(params._id);
        // add logics to check if conditional approval
        if (application.status === APPROVED){
            await this._checkConditionalApproval(application);
        }
        // populate the version with auto upgrade based on configuration
        application.version  = await this._getApplicationVersionByStatus(application.status, application.version);
        return application;
    }

    async _getApplicationVersionByStatus(status, version = null ) {
        const config = await this.configurationService.findByType("APPLICATION_FORM_VERSIONS"); //get version config dynamically
        const currentVersion = config?.current || "2.0";
        const newStatusVersion = config?.new || "3.0";
        // auto upgrade version based on configuration if status is NEW, IN_PROGRESS, INQUIRED
        // for status other than NEW, IN_PROGRESS, INQUIRED, keep original version if exists, else set current version.
        return [NEW, IN_PROGRESS, INQUIRED].includes(status) ? newStatusVersion : (!version)? currentVersion : version;
    }

    async _checkConditionalApproval(application) {
        // 1) controlled study missing dbGaPID
        const studyArr = await this.approvedStudiesService.findByStudyName(application.studyName);
        if (!studyArr || studyArr.length < 1) {
            return;
        }
        const study = studyArr[0];
        const pendingConditions = [
            ...(study?.controlledAccess && !study?.dbGaPID ? [ERROR.CONTROLLED_STUDY_NO_DBGAPID] : []),
            ...(isTrue(study?.pendingModelChange) ? [ERROR.PENDING_APPROVED_STUDY] : []),
            ...((isTrue(study?.controlledAccess) && isTrue(study?.isPendingGPA)) ? [ERROR.PENDING_APPROVED_STUDY_NO_GPA_INFO] : []),
        ];

        application.conditional = pendingConditions.length > 0;

        if (pendingConditions.length > 0) {
            application.pendingConditions = pendingConditions;
        }
    }

    async getApplicationById(id) {
        let result = await this.applicationDAO.findFirst({id: id});
        if (!result) {
            throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        }
        return result;
    }
    
    async reviewApplication(params, context) {
        await this.verifyReviewerPermission(context);
        const application = await this.getApplication(params, context);
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        if (application && application.status && application.status === SUBMITTED) {
            // If Submitted status, change it to In Review
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, IN_REVIEW, null);
            const updated = await this.applicationDAO.update({
                _id: application._id,
                status: IN_REVIEW,
                updatedAt: history.dateTime,
                history: [...(application.history || []), history]
            });
            if (updated) {
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
        // populate the version with auto upgrade based on configuration
        application.version  = await this._getApplicationVersionByStatus(application.status, application.version);
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
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            createdAt: timestamp,
            updatedAt: timestamp,
            programAbbreviation: application?.programAbbreviation,
            programDescription: application?.programDescription,
            version: (application?.version)? application.version : await this._getApplicationVersionByStatus(NEW)
        };

        if (userInfo?.organization?.orgID) {
            newApplicationProperties.organization = {
                _id: userInfo?.organization?.orgID,
                name: userInfo?.organization?.orgName || ""
            }
        }

        application = {
            ...application,
            ...newApplicationProperties
        };
        const res = await this.applicationDAO.insert(application);
        if (res?.acknowledged) await this.logCollection.insert(CreateApplicationEvent.create(userInfo._id, userInfo.email, userInfo.IDP, application._id));
        return application;
    }

    async saveApplication(params, context) {
        verifySession(context)
            .verifyInitialized()
        let inputApplication = params.application;
        const id = inputApplication?._id;
        if (!id) {
            const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CREATE);
            if (userScope.isNoneScope()) {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
            return await this.createApplication(inputApplication, context.userInfo);
        }

        const storedApplication = await this.getApplicationById(id);
        if (storedApplication?.applicant.applicantID !== context?.userInfo?._id) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const prevStatus = storedApplication?.status;
        let application = {...storedApplication, ...inputApplication, status: IN_PROGRESS};
        // auto upgrade version based on configuration
        application.version = await this._getApplicationVersionByStatus(IN_PROGRESS);

        if (inputApplication?.newInstitutions?.length > 0) {
            await this._validateNewInstitution(inputApplication?.newInstitutions);
        }

        application = await this._updateApplication(application, prevStatus, context?.userInfo?._id);
        if (prevStatus !== application.status){
            await logStateChange(this.logCollection, context.userInfo, application, prevStatus);
        }
        return this.getApplicationById(application?._id);
    }

    async _validateNewInstitution(newInstitutions) {
        const newInstitutionNames = newInstitutions
            .map(i => i?.name)
            .filter(Boolean);

        const newInstitutionIDs = newInstitutions
            .map(i => i?.id)
            .filter(Boolean);

        // The institution name is stored only when the SR gets approval, and only unique institutions should be stored.
        const duplicatesNames = newInstitutionNames.filter((item, index) => newInstitutionNames.indexOf(item) !== index);
        if (duplicatesNames.length > 0) {
            throw new Error(`${ERROR.DUPLICATE_INSTITUTION_NAME};${duplicatesNames.join(", ")}`);
        }
        // This is the generated institution ID by FE.
        const duplicatesIDs = newInstitutionIDs.filter((item, index) => newInstitutionIDs.indexOf(item) !== index);
        if (duplicatesIDs.length > 0) {
            throw new Error(`${ERROR.DUPLICATE_INSTITUTION_ID};${duplicatesIDs.join(", ")}`);
        }

        if (newInstitutionNames.length > 0) {
            const existingInstitutions = await this.institionDAO.findMany({
                name: { in: newInstitutionNames },
            });
            if (existingInstitutions.length > 0) {
                const existingInstitutionNames = existingInstitutions.map(i => i?.name);
                throw new Error(`${ERROR.DUPLICATE_INSTITUTION_NAME};${existingInstitutionNames.join(", ")}`);
            }
        }

        const InvalidInstitutionNames = newInstitutionNames.filter(i => i?.length > MAX_INSTITUTION_NAME_LENGTH);
        if (InvalidInstitutionNames?.length > 0) {
            throw new Error(`${ERROR.MAX_INSTITUTION_NAME_LIMIT};${InvalidInstitutionNames.join(", ")}`);
        }
    }

    async getMyLastApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const userID = context.userInfo._id;
        // To remove this MongoDB query, we need to refactor the schema to move applicantID to the root level.
        const matchApplicantIDToUser = {"$match": {"applicant.applicantID": userID, status: APPROVED}};
        const sortCreatedAtDescending = {"$sort": {createdAt: -1}};
        const limitReturnToOneApplication = {"$limit": 1};
        const pipeline = [
            matchApplicantIDToUser,
            sortCreatedAtDescending,
            limitReturnToOneApplication
        ];
        const result = await this.applicationDAO.aggregate(pipeline);
        const application = result.length > 0 ? result[0] : null;
        // auto upgrade version
        const res = await this.getApplicationById(application?._id);
        res.version = await this._getApplicationVersionByStatus(IN_PROGRESS);
        return res;
    }

    _listApplicationConditions(userID, userScope, programName, studyName, statues, submitterName) {
        const validApplicationStatus = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, INQUIRED, CANCELED, REJECTED, DELETED];
        const statusCondition = statues && !statues?.includes(this._ALL_FILTER) ?
            { status: { $in: statues || [] } } : { status: { $in: validApplicationStatus } };
        // Allowing empty string SubmitterName, ProgramName, StudyName
        // Submitter Name should be partial match
        const submitterQuery = submitterName?.trim().length > 0 ? {$regex: submitterName.trim().replace(/\\/g, "\\\\"), $options: "i"} : submitterName;
        const submitterNameCondition = (submitterName != null && submitterName !== this._ALL_FILTER) ? {"applicant.applicantName": submitterQuery} : {};
        const programNameCondition = (programName != null && programName !== this._ALL_FILTER) ? {programName: programName} : {};
        // Study Name should be partial match
        const studyQuery = studyName?.trim().length > 0 ? {$regex: studyName?.trim().replace(/\\/g, "\\\\"), $options: "i"} : studyName;
        const studyNameCondition = (studyName != null && studyName !== this._ALL_FILTER) ? {studyName: studyQuery} : {};

        const baseConditions = {...statusCondition, ...programNameCondition, ...studyNameCondition, ...submitterNameCondition};
        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isOwnScope()) {
            return {...baseConditions, "applicant.applicantID": userID};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }

    async listApplications(params, context) {
        verifySession(context)
            .verifyInitialized()

        const userInfo = context?.userInfo;
        const validStatuesSet = new Set([NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, APPROVED, INQUIRED, REJECTED, CANCELED, DELETED, this._ALL_FILTER]);
        const invalidStatues = (params?.statuses || [])
            .filter((i) => !validStatuesSet.has(i));
        if (invalidStatues?.length > 0) {
            throw new Error(replaceErrorString(ERROR.APPLICATION_INVALID_STATUES, `'${invalidStatues.join(",")}'`));
        }

        const validScopes = await this.authorizationService.getPermissionScope(userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW);
        const userScope = UserScope.create(validScopes);
        if (userScope.isNoneScope() || validScopes?.length === 0 || !(userScope.isAllScope() || userScope.isOwnScope())) {
            console.warn("Failed permission verification for listApplications, returning empty list");
            return {applications: [], total: 0};
        }

        const filterConditions = [
            // default filter for listing submissions
            this._listApplicationConditions(userInfo?._id, userScope, params.programName, params.studyName, params.statuses, params?.submitterName),
            // note: Aggregation of Program name should not be filtered by its name
            this._listApplicationConditions(userInfo?._id, userScope, this._ALL_FILTER, params.studyName, params.statuses, params?.submitterName),
            // note: Aggregation of Study name should not be filtered by its name
            this._listApplicationConditions(userInfo?._id, userScope, params.programName, this._ALL_FILTER, params.statuses, params?.submitterName),
            // note: Aggregation of Statues name should not be filtered by its name
            this._listApplicationConditions(userInfo?._id, userScope, params.programName, params.studyName, this._ALL_FILTER, params?.submitterName),
            // note: Aggregation of Submitter name should not be filtered by its name
            this._listApplicationConditions(userInfo?._id, userScope, params.programName, params.studyName, params.statuses, this._ALL_FILTER),
        ];
        const [listConditions, programCondition, studyNameCondition, statuesCondition, submitterNameCondition] = filterConditions;
        let pipeline = [{"$match": listConditions}];
        // convert params.orderBy from orderBy in ["Submitter Name", "Organization", "Study", "Program", "Status", "Submitted Date"] to Application in prisma schema
        const orderBy = params?.orderBy ? OrderByMap[params.orderBy]: "";
        const paginationPipe = new MongoPagination(params?.first, params.offset, orderBy, params.sortDirection);
        const noPaginationPipe = pipeline.concat(paginationPipe.getNoLimitPipeline());

        const promises = [
            this.applicationDAO.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            this.applicationDAO.aggregate(noPaginationPipe.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            // note: Program name filter is omitted
            this.applicationDAO.distinct("programName", programCondition),
            // note: Study name filter is omitted
            this.applicationDAO.distinct("studyName", studyNameCondition),
            // note: Statues filter is omitted
            this.applicationDAO.distinct("status", statuesCondition),
            // note: Submitter name filter is omitted
            this.applicationDAO.distinct("applicant.applicantName", submitterNameCondition)
        ];

        const results = await Promise.all(promises);
        const applications = (results[0] || []);
        for (let app of applications?.filter(a=>a.status === APPROVED)) {
            await this._checkConditionalApproval(app);
        }

        return {
            applications: applications,
            total: results[1]?.length,
            programs: results[2] || [],
            studies: results[3] || [],
            status: () => {
                const statusOrder = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, INQUIRED, APPROVED, REJECTED, CANCELED, DELETED];
                return (results[4] || []).sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b));
            },
            submitterNames: results[5] || []
        }
    }

    async submitApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.SUBMIT);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

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
            _id: application._id,
            history: history,
            status: SUBMITTED,
            updatedAt: historyEvent.dateTime,
            submittedDate: historyEvent.dateTime
        };
        const updated = await this.applicationDAO.update(aApplication);
        if (!updated) throw new Error(ERROR.UPDATE_FAILED);
        const logEvent = UpdateApplicationStateEvent.create(context.userInfo._id, context.userInfo.email, context.userInfo.IDP, application._id, application.status, SUBMITTED);
        await Promise.all([
            await this.logCollection.insert(logEvent),
            await sendEmails.submitApplication(this.notificationService, this.userService, this.emailParams, context.userInfo, application)
        ]);
        return application;
    }


    _getInProgressComment(history) {
        const isValidComment = history?.length > 1 &&
            ([CANCELED, DELETED].includes(history?.at(-2)?.status) // Restored Reason
            || INQUIRED === history?.at(-1)?.status);
        return isValidComment ? history?.at(-1)?.reviewComment : null;
    }

    async reopenApplication(document, context) {
        verifySession(context)
            .verifyInitialized();
        const application = await this.getApplicationById(document._id);
        if (context?.userInfo?._id !== application?.applicant?.applicantID) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        application.version = await this._getApplicationVersionByStatus(application.status, application?.version);
        if (application && application.status) {
            const reviewComment = this._getInProgressComment(application?.history);
            const history = HistoryEventBuilder.createEvent(context.userInfo._id, IN_PROGRESS, reviewComment);
            const updated = await this.applicationDAO.update({
                _id: application._id,
                status: IN_PROGRESS,
                updatedAt: history.dateTime,
                version: application.version,
                history: [...(application.history || []), history]
            });
            if (updated) {
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

    async _getUserScope(userInfo, permission) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, permission);
        const userScope = UserScope.create(validScopes);
        // valid scopes; none, all, own
        const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope() || userScope.isOwnScope();
        if (!isValidUserScope) {
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }

    async cancelApplication(document, context) {
        verifySession(context)
            .verifyInitialized();
        const userInfo = context?.userInfo;
        const userScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CANCEL);
        if (userScope.isNoneScope() || (!userScope.isOwnScope() && !userScope.isAllScope())) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        const aApplication = await this.getApplicationById(document._id);
        const isApplicationOwned = userScope.isOwnScope() && userInfo?._id === aApplication?.applicant?.applicantID;
        const validApplicationStatus = [NEW, IN_PROGRESS, SUBMITTED, IN_REVIEW, INQUIRED];
        if (!validApplicationStatus.includes(aApplication.status)) {
            throw new Error(ERROR.VERIFY.INVALID_STATE_APPLICATION);
        }
        aApplication.version = await this._getApplicationVersionByStatus(aApplication.status, aApplication?.version);
        const powerUserCond = [NEW, IN_PROGRESS, INQUIRED, SUBMITTED, IN_REVIEW].includes(aApplication?.status);
        const isValidCond = [NEW, IN_PROGRESS, INQUIRED].includes(aApplication?.status) && userInfo?._id === aApplication?.applicant?.applicantID;
        if ((userScope.isAllScope() && !powerUserCond) || (isApplicationOwned && !isValidCond)) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const history = HistoryEventBuilder.createEvent(context.userInfo._id, CANCELED, document?.comment);
        // If the application is empty, then delete the application and return the deleted application document.
        let updated = null;
        let deleteApplication = false;
        let deletedApplicationDocument = null;
        const utilityService = new UtilityService();
        if (utilityService.isEmptyApplication(aApplication)) {
            deletedApplicationDocument = await this.getApplicationById(document._id);
            updated = await this.applicationDAO.delete(document._id);
            deleteApplication = true;
        } else{
            updated = await this.applicationDAO.update({
                _id: aApplication._id,
                status: CANCELED,
                updatedAt: history.dateTime,
                version: aApplication.version,
                history: [...(aApplication?.history || []), history]
            });
        }
        if (updated) {
            await this._sendCancelApplicationEmail(userInfo, aApplication);
        } else {
            console.error(ERROR.FAILED_DELETE_APPLICATION, `${document._id}`);
            throw new Error(ERROR.FAILED_DELETE_APPLICATION);
        }
        if (deleteApplication) {
            // If application is deleted, then return null
            return deletedApplicationDocument;
        }else
            return await this.getApplicationById(document._id);
        }

    async restoreApplication(document, context) {
        const aApplication = await this.getApplicationById(document._id);
        verifyApplication(aApplication)
            .notEmpty()
            .state([CANCELED, DELETED]);

        if (!aApplication?.history?.length > 2 || ![CANCELED, DELETED].includes(aApplication?.history?.at(-1)?.status)) {
            throw new Error(ERROR.INVALID_APPLICATION_RESTORE_STATE);
        }
        const userInfo = context?.userInfo;
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.CANCEL);
        if (userScope.isNoneScope() || (!userScope.isOwnScope() && !userScope.isAllScope())) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // User owned application
        const isApplicationOwned = userInfo?._id === aApplication?.applicant?.applicantID;
        if (userScope.isOwnScope() && !isApplicationOwned) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        const prevStatus = aApplication?.history?.at(-2)?.status;
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, prevStatus, document?.comment);
        const updated = await this.applicationDAO.update({
            _id: aApplication._id,
            status: prevStatus,
            updatedAt: history.dateTime,
            history: [...(aApplication.history || []), history]
        });

        if (updated) {
            await this._sendRestoreApplicationEmail(aApplication);
        } else {
            console.error(ERROR.FAILED_RESTORE_APPLICATION, `${aApplication._id}`);
            throw new Error(ERROR.FAILED_RESTORE_APPLICATION);
        }
        return await this.getApplicationById(aApplication._id);
    }

    async approveApplication(document, context) {
        await this.verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Approved
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        application.version = await this._getApplicationVersionByStatus(application.status, application?.version);
        const approvedStudies = await this.approvedStudiesService.findByStudyName(application?.studyName);
        if (approvedStudies.length > 0) {
            throw new Error(replaceErrorString(ERROR.DUPLICATE_APPROVED_STUDY_NAME, `'${application?.studyName}'`));
        }

        const history = HistoryEventBuilder.createEvent(context.userInfo._id, APPROVED, document.comment);
        const questionnaire = getApplicationQuestionnaire(application);

        const updated = await this.applicationDAO.update({
            _id: application._id,
            reviewComment: document.comment,
            wholeProgram: document.wholeProgram,
            status: APPROVED,
            updatedAt: history.dateTime,
            version: application.version,
            history: [...(application.history || []), history]
        });
        const isDbGapMissing = (questionnaire?.accessTypes?.includes("Controlled Access") && !questionnaire?.study?.dbGaPPPHSNumber);
        const isPendingGPA = (questionnaire?.accessTypes?.includes("Controlled Access") && Boolean((!updated?.GPAName?.trim() || !updated?.GPAEmail?.trim())));
        let promises = [];

        promises.push(this.institutionService.addNewInstitutions(application?.newInstitutions));
        promises.push(this.sendEmailAfterApproveApplication(context, application, document?.comment, isDbGapMissing, isTrue(document?.pendingModelChange), isPendingGPA));
        if (updated) {
            promises.unshift(this.getApplicationById(document._id));
            if(questionnaire) {
                const approvedStudies = await this._saveApprovedStudies(application, questionnaire, document?.pendingModelChange);
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
                // Program already exists, and append a new study into the program
                const existingProgram = await this.organizationService.getOrganizationByID(questionnaire?.program?._id);
                const programStudies = existingProgram?.studies || [];
                const filteredStudies = programStudies.filter((study)=> study?._id === approvedStudies?._id);
                if (existingProgram && (programStudies.length === 0 || filteredStudies.length === 0)) {
                    promises.push(this.organizationService.organizationCollection.update({_id: existingProgram?._id, studies: [...programStudies, approvedStudies], updatedAt: getCurrentTime()}));
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
        await this.verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed or Submitted -> Inquired
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        application.version = await this._getApplicationVersionByStatus(application.status, application?.version);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, REJECTED, document.comment);
        const updated = await this.applicationDAO.update({
            _id: application._id,
            reviewComment: document.comment,
            status: REJECTED,
            updatedAt: history.dateTime,
            version: application.version,
            history: [...(application.history || []), history]
        });

        await sendEmails.rejectApplication(this.notificationService, this.userService, this.emailParams, application, document.comment);
        if (updated) {
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
        await this.verifyReviewerPermission(context);
        const application = await this.getApplicationById(document._id);
        // In Reviewed or Submitted -> Inquired
        verifyApplication(application)
            .notEmpty()
            .state([IN_REVIEW, SUBMITTED]);
        // auto upgrade version
        application.version = await this._getApplicationVersionByStatus(application.status);
        const history = HistoryEventBuilder.createEvent(context.userInfo._id, INQUIRED, document.comment);
        const updated = await this.applicationDAO.update({
            _id: application._id,
            reviewComment: document.comment,
            status: INQUIRED,
            updatedAt: history.dateTime,
            version: application.version,
            history: [...(application.history || []), history]
        });
        await sendEmails.inquireApplication(this.notificationService, this.userService, this.emailParams, application, document?.comment);
        if (updated) {
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
        const applications = await this.applicationDAO.aggregate([{$match: inactiveCondition}]);
        verifyApplication(applications)
            .isUndefined();

        if (applications?.length > 0) {
            const [applicantUsers, BCCUsers] = await Promise.all([
                this._findUsersByApplicantIDs(applications),
                this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_DELETE],
                    [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            ]);

            const permittedUserIDs = new Set(
                applicantUsers
                    ?.filter((u) => u?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_DELETE))
                    ?.map((u) => u?._id)
            );
            const history = HistoryEventBuilder.createEvent("", DELETED, this._DELETE_REVIEW_COMMENT);
            // Prisma does not support $set/$push like MongoDB. You need to update each application individually.
            const updated = await Promise.all(applications.map(async (app) => {
                return this.applicationDAO.update({
                    _id: app._id,
                    status: DELETED,
                    updatedAt: history.dateTime,
                    inactiveReminder: true,
                    history: [...(app.history || []), history]
                });
            }));
            if (updated) {
                console.log("Executed to delete application(s) because of no activities at " + getCurrentTime());
                await Promise.all(applications.map(async (app) => {
                    if (permittedUserIDs.has(app?.applicant?.applicantID)) {
                        await sendEmails.inactiveApplications(this.notificationService,this.emailParams, app?.applicant?.applicantEmail, app?.applicant?.applicantName, app, getUserEmails(BCCUsers));
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
        // The system sends an email reminder a day before the data submission expires
        const finalInactiveApplications = await this._getInactiveSubmissions(this.emailParams.inactiveDays - 1, this._FINAL_INACTIVE_REMINDER)
        if (finalInactiveApplications?.length > 0) {
            await Promise.all(finalInactiveApplications.map(async (aApplication) => {
                await this._sendEmailFinalInactiveApplication(aApplication);
            }));
            const applicationIDs = finalInactiveApplications
                .map(application => application._id);
            const query = {_id: {$in: applicationIDs}};
            // Disable all reminders to ensure no notifications are sent.
            const everyReminderDays = this._getEveryReminderQuery(this.emailParams.inactiveApplicationNotifyDays, true);
            const updatedReminder = await this.applicationDAO.updateMany(query, everyReminderDays);
            if (!updatedReminder?.count || updatedReminder?.count === 0) {
                console.error("The email reminder flag intended to notify the inactive submission request (FINAL) is not being stored", `submissionIDs: ${applicationIDs.join(', ')}`);
            }
        }
        // Map over inactiveDays to create an array of tuples [day, promise]
        const inactiveApplicationsPromises = [];
        for (const day of this.emailParams.inactiveApplicationNotifyDays) {
            const pastInactiveDays = this.emailParams.inactiveDays - day;
            inactiveApplicationsPromises.push([pastInactiveDays, await this._getInactiveSubmissions(pastInactiveDays, `${this._INACTIVE_REMINDER}_${day}`)]);
        }
        const inactiveApplicationsResult = await Promise.all(inactiveApplicationsPromises);
        const inactiveApplicationMapByDays = inactiveApplicationsResult.reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
        // For Sorting, the oldest submission about to expire submission will be sent at once.
        const sortedKeys = Object.keys(inactiveApplicationMapByDays).sort((a, b) => b - a);
        let uniqueSet = new Set();  // Set to track used _id values
        sortedKeys.forEach((key) => {
            // Filter out _id values that have already been used
            inactiveApplicationMapByDays[key] = inactiveApplicationMapByDays[key].filter(obj => {
                if (!uniqueSet.has(obj._id)) {
                    uniqueSet.add(obj._id);
                    return true;  // Keep this object
                }
                return false;  // Remove this object as it's already been used
            });
        });

        if (uniqueSet.size > 0) {
            const emailPromises = [];
            let inactiveApplications = [];
            for (const [pastDays, aApplicationArray] of Object.entries(inactiveApplicationMapByDays)) {
                for (const aApplication of aApplicationArray) {
                    const emailPromise = (async (pastDays) => {
                        // by default, final reminder 180 days
                        await this._sendEmailInactiveApplication(aApplication, pastDays);
                    })(pastDays);
                    emailPromises.push(emailPromise);
                    inactiveApplications.push([aApplication?._id, pastDays]);
                }
            }
            await Promise.all(emailPromises);
            const submissionReminderDays = this.emailParams.inactiveApplicationNotifyDays;
            for (const inactiveApplication of inactiveApplications) {
                const applicationID = inactiveApplication[0];
                const pastDays = inactiveApplication[1];
                const expiredDays = this.emailParams.inactiveDays - pastDays;
                const reminderDays = submissionReminderDays.filter((d) => expiredDays < d || expiredDays === d);
                // The applications with the closest expiration dates will be flagged as true; no sent any notification anymore
                // A notification will be sent at each interval. ex) 7, 30, 60 days before expiration
                const reminderFilter = reminderDays.reduce((acc, day) => {
                    acc[`${this._INACTIVE_REMINDER}_${day}`] = true;
                    return acc;
                }, {});
                const updatedReminder = await this.applicationDAO.update({_id: applicationID, ...reminderFilter});
                if (!updatedReminder) {
                    console.error("The email reminder flag intended to notify the inactive submission request is not being stored", applicationID);
                }
            }
        }
    }

    async _getInactiveSubmissions(inactiveDays, inactiveFlagField) {
        const remindCondition = {
            updatedAt: {
                $lt: subtractDaysFromNow(inactiveDays),
            },
            status: {
                $in: [NEW, IN_PROGRESS, INQUIRED]
            },
            // Tracks whether the notification has already been sent
            [inactiveFlagField]: {$ne: true}
        };
        return await this.applicationDAO.aggregate([{$match: remindCondition}]);
    }

    async _findUsersByApplicantIDs(applications) {
        const applicantIDs = applications
            ?.map((a) => a?.applicant?.applicantID) // Extract applicant IDs
            ?.filter(Boolean);

        return await this.userService.userCollection.aggregate([{
            "$match": {"_id": { "$in": applicantIDs }
            }}]);
    }

    async sendEmailAfterApproveApplication(context, application, comment, isDbGapMissing = false, isPendingModelChange, isPendingGPA = false) {
        const res = await Promise.all([
            this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW],
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD, ROLES.ADMIN]),
            this.userService.userCollection.find(application?.applicant?.applicantID)
        ]);

        const [toBCCUsers, applicant] = res;
        const applicantInfo = applicant?.pop();
        const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
        const toBCCEmails = getUserEmails(toBCCUsers)
            ?.filter((email) => !CCEmails.includes(email) && applicantInfo?.email !== email);
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW)) {
            if (!isDbGapMissing && !isPendingModelChange && !isPendingGPA) {
                await this.notificationService.approveQuestionNotification(application?.applicant?.applicantEmail,
                    CCEmails,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A"
                    },
                    {
                        study: application?.studyAbbreviation,
                        contactEmail: `${this.emailParams.conditionalSubmissionContact}.`
                });
                return;
            }

            const pendingChange = [isDbGapMissing, isPendingModelChange, isPendingGPA];
            const filteredPendingChange = pendingChange.filter(Boolean);
            if (filteredPendingChange?.length > 1) {
                await this.notificationService.multipleChangesApproveQuestionNotification(application?.applicant?.applicantEmail,
                    CCEmails,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        contactEmail: this.emailParams?.conditionalSubmissionContact,
                        reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A",
                        study: setDefaultIfNoName(application?.studyName),
                        submissionGuideURL: this.emailParams?.submissionGuideURL
                    },
                    isDbGapMissing,
                    isPendingModelChange,
                    isPendingGPA
                );
                return;
            }

            if (isDbGapMissing) {
                await this.notificationService.dbGapMissingApproveQuestionNotification(application?.applicant?.applicantEmail,
                    CCEmails,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        contactEmail: this.emailParams?.conditionalSubmissionContact,
                        reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A",
                        study: setDefaultIfNoName(application?.studyName),
                        submissionGuideURL: this.emailParams?.submissionGuideURL
                    }
                );
                return;
            }

            if (isPendingModelChange) {
                await this.notificationService.dataModelChangeApproveQuestionNotification(application?.applicant?.applicantEmail,
                    CCEmails,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        contactEmail: this.emailParams?.conditionalSubmissionContact,
                        reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A",
                        study: setDefaultIfNoName(application?.studyName),
                        submissionGuideURL: this.emailParams?.submissionGuideURL
                    }
                );
            }

            if (isPendingGPA) {
                await this.notificationService.pendingGPANotification(application?.applicant?.applicantEmail,
                    CCEmails,
                    toBCCEmails,
                    {
                        firstName: application?.applicant?.applicantName,
                        contactEmail: this.emailParams?.conditionalSubmissionContact,
                        reviewComments: comment && comment?.trim()?.length > 0 ? comment?.trim() : "N/A",
                        study: setDefaultIfNoName(application?.studyName),
                        submissionGuideURL: this.emailParams?.submissionGuideURL
                    }
                );
            }
        }
    }

    async _cancelApplicationEmailInfo(application) {
        const [applicant, BCCUsers] = await Promise.all([
            this.userService.userCollection.find(application?.applicant?.applicantID),
            this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_CANCEL],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN])
        ]);
        const applicantInfo = applicant?.pop();

        const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
        const toBCCEmails = getUserEmails(BCCUsers)
            ?.filter((email) => !CCEmails.includes(email) && applicantInfo?.email !== email);

        return [applicantInfo, CCEmails, toBCCEmails];
    }

    async _sendCancelApplicationEmail(userCanceledBy, application) {
        const [applicantInfo, CCEmails, BCCUserEmails] = await this._cancelApplicationEmailInfo(application);
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_CANCEL)) {
            if (!applicantInfo?.email) {
                console.error("Cancel submission request email notification does not have any recipient", `Application ID: ${application?._id}`);
                return;
            }
            const canceledByName = [ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL].includes(userCanceledBy?.role) ? this._CRDC_TEAM: `${userCanceledBy.firstName} ${userCanceledBy.lastName || ""}`;
            await this.notificationService.cancelApplicationNotification(applicantInfo?.email, CCEmails, BCCUserEmails, {
                firstName: `${applicantInfo.firstName} ${applicantInfo.lastName || ""}`
            },{
                studyName: `${application?.studyName?.trim() || "NA"},`,
                canceledNameBy: canceledByName,
                contactEmail: `${this.emailParams.conditionalSubmissionContact}.`
            });
        }
    }

    async _sendRestoreApplicationEmail(application) {
        const [applicantInfo, CCEmails, BCCUserEmails] = await this._cancelApplicationEmailInfo(application);
        if (!applicantInfo?.email) {
            console.error("Restore submission request email notification does not have any recipient", `Application ID: ${application?._id}`);
            return;
        }

        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_CANCEL)) {
            await this.notificationService.restoreApplicationNotification(applicantInfo?.email, CCEmails, BCCUserEmails,{
                firstName: `${applicantInfo.firstName} ${applicantInfo.lastName || ""}`
            },{
                studyName: `${application?.studyName?.trim() || "NA"},`,
                contactEmail: `${this.emailParams.conditionalSubmissionContact}.`
            });
        }

    }

    async _sendEmailFinalInactiveApplication(application) {
        const [aSubmitter, BCCUsers] = await Promise.all([
            this.userService.getUserByID(application?.applicant?.applicantID),
            this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_EXPIRING],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN])
        ]);

        const filteredBCCUsers = BCCUsers.filter((u) => u?._id !== aSubmitter?._id);
        if (!aSubmitter?.email) {
            console.log("The final inactive application reminder was not sent.", `Submission Request ID: ${application?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_EXPIRING)) {
            const studyName = application?.studyAbbreviation?.trim();
            const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
            const toBCCEmails = getUserEmails(filteredBCCUsers)
                ?.filter((email) => !CCEmails.includes(email));
            await this.notificationService.finalRemindApplicationsNotification(aSubmitter?.email,
                CCEmails,
                toBCCEmails, {
                    firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`,
                    studyName: studyName?.length > 0 ? studyName : "N/A"
                },{
                    inactiveDays: this.emailParams.inactiveDays,
                    url: this.emailParams.url
                });
            logDaysDifference(this.emailParams.inactiveDays - 1, application?.updatedAt, application?._id);
        }
    }

    async _sendEmailInactiveApplication(application, interval) {
        const [aSubmitter, BCCUsers] = await Promise.all([
            this.userService.getUserByID(application?.applicant?.applicantID),
            this.userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_EXPIRING],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN])
        ]);

        if (!aSubmitter?.email) {
            console.log("The inactive application reminder was not sent.", `${interval} days Submission Request ID: ${application?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_EXPIRING)) {
            const studyName = application?.studyAbbreviation?.trim();
            const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
            const filteredBCCUsers = BCCUsers.filter((u) => u?._id !== aSubmitter?._id);
            const toBCCEmails = getUserEmails(filteredBCCUsers)
                ?.filter((email) => !CCEmails.includes(email));
            await this.notificationService.remindApplicationsNotification(aSubmitter?.email,
                CCEmails,
                toBCCEmails, {
                    firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`,
                    studyName: studyName?.length > 0 ? studyName : "N/A"
                },{
                    remainDays: this.emailParams.inactiveDays - interval,
                    inactiveDays: interval,
                    url: this.emailParams.url
                });
            logDaysDifference(interval, application?.updatedAt, application?._id);
        }
    }

    // Generates a query for the status of all email notification reminder.
    _getEveryReminderQuery(remindSubmissionDay, status) {
        return remindSubmissionDay.reduce((acc, day) => {
            acc[`${this._INACTIVE_REMINDER}_${day}`] = status;
            return acc;
        }, {[`${this._FINAL_INACTIVE_REMINDER}`]: status});
    }

    async _saveApprovedStudies(aApplication, questionnaire, pendingModelChange) {
        // use study name when study abbreviation is not available
        const studyAbbreviation = !!aApplication?.studyAbbreviation?.trim() ? aApplication?.studyAbbreviation : questionnaire?.study?.name;
        const controlledAccess = aApplication?.controlledAccess;
        if (isUndefined(controlledAccess)) {
            console.error(ERROR.APPLICATION_CONTROLLED_ACCESS_NOT_FOUND, ` id=${aApplication?._id}`);
        }
        const programName = aApplication?.programName ?? "NA";
        const pendingGPAInfo = {GPAName: aApplication?.GPAName, GPAEmail: aApplication?.GPAEmail, isPendingGPA: Boolean((aApplication?.GPAName?.trim() && aApplication?.GPAEmail?.trim()))};
        const pendingGPA = isTrue(controlledAccess) ? pendingGPAInfo : null;
        // Upon approval of the submission request, the data concierge is retrieved from the associated program.
        return await this.approvedStudiesService.storeApprovedStudies(
            aApplication?._id, aApplication?.studyName, studyAbbreviation, questionnaire?.study?.dbGaPPPHSNumber, aApplication?.organization?.name, controlledAccess, aApplication?.ORCID,
            aApplication?.PI, aApplication?.openAccess, programName, true, pendingModelChange, null, pendingGPA
        );
    }

    async verifyReviewerPermission(context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.REVIEW);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
    }

    async _updateApplication(application, prevStatus, userID) {
        if (prevStatus !== IN_PROGRESS) {
            application = {history: [], ...application};
            const historyEvent = HistoryEventBuilder.createEvent(userID, IN_PROGRESS, null);
            application.history.push(historyEvent);
        }
        // Save an email reminder when an inactive application is reactivated.
        application.inactiveReminder = false;
        application.updatedAt = getCurrentTime();
        const {...data} = application;
        const updateResult = await this.applicationDAO.update({_id: application?._id, ...data});
        if (!updateResult) {
            throw new Error(ERROR.APPLICATION_NOT_FOUND + updateResult?._id);
        }
        return updateResult;
    }
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

const getCCEmails = (submitterEmail, application) => {
    const questionnaire = getApplicationQuestionnaire(application);
    if (!questionnaire || !submitterEmail) {
        return [];
    }
    const CCEmailsSet = new Set([questionnaire?.primaryContact?.email, questionnaire?.pi?.email]
        .filter((email) => email && email !== submitterEmail && EMAIL_REGEX.test(email)));
    return CCEmailsSet.toArray();
}

const sendEmails = {
    inactiveApplications: async (notificationService, emailParams, email, applicantName, application, BCCEmails) => {
        const CCEmails = getCCEmails(email, application);
        const toBCCEmails = BCCEmails
            ?.filter((BCCEmail) => !CCEmails.includes(BCCEmail) && BCCEmail !== email);
        await notificationService.inactiveApplicationsNotification(email,
            CCEmails,
            toBCCEmails, {
            firstName: applicantName},{
            pi: `${applicantName}`,
            study: setDefaultIfNoName(application?.studyAbbreviation),
            officialEmail: `${emailParams.officialEmail}.`,
            inactiveDays: emailParams.inactiveDays,
            url: emailParams.url
        });
        logDaysDifference(emailParams.inactiveDays, application?.updatedAt, application?._id);
    },
    submitApplication: async (notificationService, userService, emailParams, userInfo, application) => {
        const applicantInfo = (await userService.userCollection.find(application?.applicant?.applicantID))?.pop();
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_SUBMIT)) {
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_SUBMIT],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);
            const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
            const toBCCEmails = getUserEmails(BCCUsers)
                ?.filter((email) => !CCEmails.includes(email) && applicantInfo?.email !== email);

            await notificationService.submitRequestReceivedNotification(application?.applicant?.applicantEmail,
                CCEmails,
                toBCCEmails,
                {helpDesk: `${emailParams.conditionalSubmissionContact}.`},
                {userName: application?.applicant?.applicantName}
            );
        }

        const toUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW],
            [ROLES.FEDERAL_LEAD]);

        if (!toUsers || toUsers?.length === 0) {
            console.error("SR for Submit email notification does not have any recipient", `Application ID: ${application?._id}`);
            return;
        }
        if (toUsers?.length > 0) {
            const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_READY_REVIEW],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]);
            const toEmails = getUserEmails(toUsers);
            const toBCCEmails = getUserEmails(BCCUsers)
                ?.filter((email) => !toEmails?.includes(email));
            const programName = application?.programName?.trim() || "NA";
            await notificationService.submitQuestionNotification(getUserEmails(toUsers),
                [],
                toBCCEmails, {
                pi: `${userInfo.firstName} ${userInfo.lastName}${programName === "NA" ? "." : `, and associated with the ${programName} program.`}`,
                study: application?.studyAbbreviation || "NA",
                url: emailParams.url
            });
        }
    },
    inquireApplication: async(notificationService, userService, emailParams, application, reviewComments) => {
        const res = await Promise.all([
            userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW],
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD, ROLES.ADMIN]),
            userService.userCollection.find(application?.applicant?.applicantID)
        ]);
        const [toBCCUsers, applicant] = res;
        const applicantInfo = (applicant)?.pop();
        if (applicantInfo?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_REVIEW)) {
            const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
            const toBCCEmails = getUserEmails(toBCCUsers)
                ?.filter((email) => !CCEmails.includes(email) && applicantInfo?.email !== email);
            await notificationService.inquireQuestionNotification(application?.applicant?.applicantEmail,
                CCEmails,
                toBCCEmails,{
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
                [ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD, ROLES.ADMIN]);
            const CCEmails = getCCEmails(application?.applicant?.applicantEmail, application);
            const toBCCEmails = getUserEmails(BCCUsers)
                ?.filter((email) => !CCEmails.includes(email) && applicantInfo?.email !== email);
            await notificationService.rejectQuestionNotification(application?.applicant?.applicantEmail,
                CCEmails,
                toBCCEmails, {
                firstName: application?.applicant?.applicantName,
                reviewComments
            }, {
                study: `${application?.studyAbbreviation},`
            });
        }
    }
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

function logDaysDifference(inactiveDays, accessedAt, applicationID) {
    const startedDate = accessedAt; // Ensure it's a Date object
    const endDate = getCurrentTime();
    const differenceMs = endDate - startedDate; // Difference in milliseconds
    const days = Math.floor(differenceMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((differenceMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((differenceMs % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`Application ID: ${applicationID}, Inactive Days: ${inactiveDays}, Last Accessed: ${startedDate}, Current Time: ${endDate}  Difference: ${days} days, ${hours} hours, ${minutes} minutes`);
}

module.exports = {
    Application
};
