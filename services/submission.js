const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS } = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession, verifyApiToken, verifySubmitter} = require("../verifier/user-info-verifier");
const {verifySubmissionAction} = require("../verifier/submission-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {formatName} = require("../utility/format-name");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {SubmissionActionEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const { API_TOKEN } = require("../constants/application-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {AWSService} = require("../services/aws-request")
const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";
const NA = "NA"
const config = require("../config");

// TODO: Data commons needs to be in a predefined list, currently only "CDS" and "CCDI" are allowed
// eventually frontend and backend will use same source for this list.
const dataCommonsTempList = ["CDS", "CCDI"];
const UPLOAD_TYPES = ['file','metadata'];
const LOG_DIR = 'logs';
const LOG_FILE_EXT ='.log';
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
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
        const userOrgObject = await this.organizationService.getOrganizationByName(userInfo?.organization?.orgName);
        if (!userOrgObject.studies.some((study) => study.studyAbbreviation === params.studyAbbreviation)) {
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
            bucketName: userOrgObject.bucketName,
            rootPath: userOrgObject.rootPath.concat(`/${submissionID}`),
            status: NEW,
            history: [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)],
            conciergeName: userOrgObject.conciergeName,
            conciergeEmail: userOrgObject.conciergeEmail,
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
        if (context.userInfo.role === ROLES.USER) {
            return {submissions: [], total: 0};
        }
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
        // updated to handle both API-token and session.
        const userInfo = authenticateUser(context);
        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.FILE]);
        // Optional metadata intention
        if (params.type === BATCH.TYPE.METADATA) {
            verifyBatch(params)
                .metadataIntention([BATCH.INTENTION.NEW]);
        }
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
        const aOrganization = await this.organizationService.getOrganizationByName(userInfo?.organization?.orgName);
        return await this.batchService.createBatch(params, aSubmission?.rootPath, aOrganization?._id);
    }

    async updateBatch(params, context) {
        const userInfo = authenticateUser(context);
        verifyBatch(params)
            .isValidBatchID()
            .notEmpty();

        const aBatch = await this.batchService.findByID(params?.batchID);
        if (!aBatch) {
            throw new Error(ERROR.BATCH_NOT_EXIST);
        }
        if (![BATCH.STATUSES.NEW].includes(aBatch?.status)) {
            throw new Error(ERROR.INVALID_UPDATE_BATCH_STATUS);
        }
        const aSubmission = await findByID(this.submissionCollection, aBatch.submissionID);
        // submission owner & submitter's Org Owner
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
        return await this.batchService.updateBatch(aBatch, params?.files, userInfo);
    }

    async listBatches(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection,params?.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        const validSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.DC_POC, USER.ROLES.CURATOR, USER.ROLES.FEDERAL_LEAD, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER];
        if (!validSubmissionRoles.includes(context?.userInfo?.role)) {
            throw new Error(ERROR.INVALID_SUBMISSION_PERMISSION);
        }
        return this.batchService.listBatches(params, context);
    }

  async getSubmission(params, context){
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN]);
        const aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }else{
            // view condition
            const conditionDCPOC = (context?.userInfo?.role === ROLES.DC_POC )&& (context?.userInfo?.dataCommons.includes(aSubmission?.dataCommons));
            const conditionORGOwner = (context?.userInfo?.role === ROLES.ORG_OWNER )&& (context?.userInfo?.organization?.orgID === aSubmission?.organization?._id);
            const conditionSubmitter = (context?.userInfo?.role === ROLES.SUBMITTER) && (context?.userInfo?._id === aSubmission?.submitterID);
            const conditionAdmin = [ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN].includes(context?.userInfo?.role );
            //  role based access control
            if( conditionDCPOC || conditionORGOwner || conditionSubmitter || conditionAdmin){
                return aSubmission
            }
            throw new Error(ERROR.INVALID_ROLE);
        }
    }
    /**
     * API: submissionAction
     * @param {*} params 
     * @param {*} context 
     * @returns updated submission
     */
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
        let fromStatus = submission.status;
        //verify if the action is valid based on current submission status
        verifier.isValidAction();
        //verify if user's role is valid for the action
        const newStatus = verifier.inRoles(userInfo);

        //update submission
        let events = submission.history || [];
        events.push(HistoryEventBuilder.createEvent(userInfo._id, newStatus, null));
        submission = {
            ...submission,
            status: newStatus,
            history: events,
            updatedAt: getCurrentTime()
        }
        const updated = await this.submissionCollection.update(submission);
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
        }
        //log event and send notification
        const logEvent = SubmissionActionEvent.create(userInfo._id, userInfo.email, userInfo.IDP, submission._id, action, fromStatus, newStatus);
        await Promise.all([
            await this.logCollection.insert(logEvent),
            await submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService)
        ]);
        return submission;
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
        const rootPath = submission.rootPath;
        try {
            const fileList = await this.getLogFiles(config.submission_bucket, rootPath);
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
}
    
/**
 * submissionActionNotification
 * @param {*} userInfo 
 * @param {*} action 
 * @param {*} aSubmission
 * @param {*} userService 
 * @param {*} organizationService
 * @param {*} notificationService
 */
async function submissionActionNotification(userInfo, action, aSubmission, userService, organizationService, notificationService) {
    switch(action) {
        case ACTIONS.SUBMIT:
            await sendEmails.submitSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.RELEASE:
            //todo send release email
            break;
        case ACTIONS.WITHDRAW:
            await sendEmails.withdrawSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.REJECT:
            await sendEmails.rejectSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.COMPLETE:
            await sendEmails.completeSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.CANCEL:
            await sendEmails.cancelSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.RESUME:
            //todo send resume email
            break;
        case ACTIONS.ARCHIVE:
            //todo send archived email
            break;
        default:
            console.error(ERROR.NO_SUBMISSION_RECEIVER+ `id=${aSubmission?._id}`);
            break;
    }
}

const completeSubmissionEmailInfo = async (userInfo, aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await userService.getAdmin(),
        await userService.getUserByID(aSubmission?.submitterID),
        await userService.getPOCs(),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id)
    ];

    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const adminEmails = getUserEmails(results[1] || []);
    const submitterEmails = getUserEmails([results[2] || {}]);

    // CCs for Submitter, org owner, admins
    const ccEmails = new Set([...submitterEmails, ...orgOwnerEmails, ...adminEmails]).toArray();
    // To POC role users
    const POCs = results[3] || [];
    const aOrganization = results[4] || {};
    return [ccEmails, POCs, aOrganization];
}

const cancelOrWithdrawSubmissionEmailInfo = async (aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id)
    ];
    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const aOrganization = results[1] || {};
    const curatorEmails = getUserEmails([{email: aOrganization?.conciergeEmail}]);

    const ccEmails = new Set([orgOwnerEmails, curatorEmails]).toArray();
    return [ccEmails, aOrganization];
}

const sendEmails = {
    submitSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);

        const promises = [
            await userService.getOrgOwner(aSubmission?.organization?._id),
            await organizationService.getOrganizationByID(aSubmitter?.organization?.orgID),
            await userService.getAdmin(),
        ];
        let results;
        await Promise.all(promises).then(async function(returns) {
            results = returns;
        });
        const aOrganization = results[1] || {};

        const orgOwnerEmails = getUserEmails(results[0] || []);
        const adminEmails = getUserEmails(results[2] || []);
        const curatorEmails = {email: aOrganization?.conciergeEmail || null}


        // CCs for org owner, Data Curator (or admins if not yet assigned exists)
        let ccEmailsVar 
        if(!curatorEmails?.email){
            ccEmailsVar = adminEmails
        }else{
            ccEmailsVar = curatorEmails
        }
        const ccEmails = [...orgOwnerEmails, ...ccEmailsVar];
        await notificationService.submitDataSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: aSubmitter?.firstName
            }, {
            idandname: `${aSubmission?.name} (ID: ${aSubmission?._id})`,
            dataconcierge: `${aSubmission?.conciergeName || 'NA'} at ${aSubmission?.conciergeEmail||'NA'}.`
            }
        );
    },
    completeSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        const [ccEmails, POCs, aOrganization] = await completeSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (POCs.length === 0) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        // could be multiple POCs
        const notificationPromises = POCs.map(aUser =>
            notificationsService.completeSubmissionNotification(aUser?.email, ccEmails, {
                firstName: aUser?.firstName
            }, {
                submissionName: aSubmission?.name,
                // only one study
                studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                conciergeName: aOrganization?.conciergeName || NA,
                conciergeEmail: aOrganization?.conciergeEmail || NA
            })
        );
        await Promise.all(notificationPromises);
    },
    cancelSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await cancelOrWithdrawSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationService.cancelSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: aSubmitter?.firstName
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            canceledBy: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
            conciergeEmail: aOrganization?.conciergeEmail || NA,
            conciergeName: aOrganization?.conciergeName || NA
        });
    },
    withdrawSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        if (!userInfo?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await cancelOrWithdrawSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationsService.withdrawSubmissionNotification(userInfo?.email, ccEmails, {
            firstName: userInfo.firstName
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            // only one study
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            submitterName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
            submitterEmail: `${userInfo?.email}`
        });
    },
    rejectSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const promises = [
            await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
            await organizationService.getOrganizationByID(aSubmission?.organization?._id),
            await userService.getAdmin()
        ];
        const results = await Promise.all(promises);
        const orgOwnerEmails = getUserEmails(results[0] || []);
        const aOrganization = results[1] || {};
        const curatorEmails = getUserEmails([{email: aOrganization?.conciergeEmail}]);
        const adminEmails = getUserEmails(results[2] || []);
        // CCs for org owner, curators
        const ccEmails = new Set([...orgOwnerEmails, ...curatorEmails, ...adminEmails]).toArray();
        await notificationService.rejectSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: aSubmitter?.firstName
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            conciergeEmail: aOrganization?.conciergeEmail || NA,
            conciergeName: aOrganization?.conciergeName || NA
        });
    },
}

// only one study name
const getSubmissionStudyName = (studies, aSubmission) => {
    const studyNames = studies
        ?.filter((aStudy) => aStudy?.studyAbbreviation === aSubmission?.studyAbbreviation)
        ?.map((aStudy) => aStudy.studyName);
    return studyNames?.length > 0 ? studyNames[0] : NA;
}

const getUserEmails = (users) => {
    return users
        ?.filter((aUser) => aUser?.email)
        ?.map((aUser)=> aUser.email);
}


const findByID = async (submissionCollection, id) => {
    const aSubmission = await submissionCollection.find(id);
    return (aSubmission?.length > 0) ? aSubmission[0] : null;
}

const authenticateUser = (context) => {
    if (context[API_TOKEN]) {
        return verifyApiToken(context, config.token_secret);
    }
    verifySession(context)
        .verifyInitialized();
    return context?.userInfo;
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
    const organizationOwners = await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name);
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



function listConditions(userID, userRole, userDataCommons, userOrganization, params){
    const validApplicationStatus = {status: {$in: [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
        REJECTED, WITHDRAWN]}};
    // Default conditions are:
    // Make sure application has valid status
    let conditions = {...validApplicationStatus};
    // Filter on organization and status
    if (params.organization !== ALL_FILTER) {
        conditions = {...conditions, "organization._id": params.organization};
    }
    if (params.status !== ALL_FILTER) {
        conditions = {...conditions, status: params.status};
    }
    // List all applications if Fed Lead / Admin / Data Concierge / Data Curator
    const listAllApplicationRoles = [ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR];
    if (listAllApplicationRoles.includes(userRole)) {
        return [{"$match": conditions}];
    }
    // If data commons POC, return all data submissions associated with their data commons
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
        params.status !== REJECTED &&
        params.status !== WITHDRAWN &&
        params.status !== CANCELED &&
        params.status !== ALL_FILTER
        ) {
        throw new Error(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER);
    }
    // Don't need to validate organization as frontend uses the same organization collection
    // as backend does as selection options. AKA, frontend will only ever send valid organizations.
}

module.exports = {
    Submission
};

