const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS
} = require("../constants/submission-constants");
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

// TODO: Data commons needs to be in a predefined list, currently only "CDS" and "ICDC" are allowed
// eventually frontend and backend will use same source for this list.
const dataCommonsTempList = ["CDS", "ICDC"];
const UPLOAD_TYPES = ['file','metadata'];
const LOG_DIR = 'logs';
const LOG_FILE_EXT_ZIP ='.zip';
const LOG_FILE_EXT_LOG ='.log';
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService, dataRecordService, tier) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
        this.dataRecordService = dataRecordService;
        this.tier = tier;
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
        const aUserOrganization= await this.organizationService.getOrganizationByName(userInfo?.organization?.orgName);
        if (!aUserOrganization.studies.some((study) => study.studyAbbreviation === params.studyAbbreviation)) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }

        const newSubmission = DataSubmission.createSubmission(params.name, userInfo, params.dataCommons, params.studyAbbreviation, params.dbGaPID, aUserOrganization);
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
                .metadataIntention([BATCH.INTENTION.NEW, BATCH.INTENTION.UPDATE, BATCH.INTENTION.DELETE]);
        }
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
        // The submission status must be valid states
        if (![NEW, IN_PROGRESS ,WITHDRAWN, REJECTED].includes(aSubmission?.status)) {
            throw new Error(ERROR.INVALID_SUBMISSION_STATUS);
        }
        const result = await this.batchService.createBatch(params, aSubmission?.rootPath);
        // The submission status needs to be updated after createBatch
        if ([NEW, WITHDRAWN, REJECTED].includes(aSubmission?.status)) {
            await updateSubmissionStatus(this.submissionCollection, aSubmission, userInfo, IN_PROGRESS);
        }
        return result;
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
        if (![BATCH.STATUSES.UPLOADING].includes(aBatch?.status)) {
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
        verifier.isValidSubmitAction(userInfo?.role, submission);
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
            await submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService, this.tier)
        ]);
        return submission;
    }


    async submissionStats(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection, params?._id);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        isSubmissionPermitted(aSubmission, context?.userInfo);
        return this.dataRecordService.submissionStats(aSubmission?._id);
    }

    /**
     * API to get list of upload log files
     * @param {*} params 
     * @param {*} context 
     * @returns dictionary
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
     * @param {*} params as object {} contains submission ID
     * @param {*} context 
     * @returns fileList []
     */
    async getLogFiles(bucket, rootPath){
        this.aws = new AWSService();
        let fileList = []; 
        for (let type of UPLOAD_TYPES){
            //check if zip existing
            let file = await this.aws.getLastFileFromS3(bucket, `${rootPath}/${type}/${LOG_DIR}`, type, LOG_FILE_EXT_ZIP);
            // if not, check log file.
            if (!file || !file.downloadUrl) {
                file = await this.aws.getLastFileFromS3(bucket, `${rootPath}/${type}/${LOG_DIR}`, type, LOG_FILE_EXT_LOG);
            }

            if(file) fileList.push(file);
        }
        return fileList;
    }


    async validateSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.ORG_OWNER, ROLES.CURATOR, ROLES.SUBMITTER]);
        const aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        const userInfo = context?.userInfo;
        const promises = [
            await this.userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
            await this.userService.getUserByID(aSubmission?.submitterID),
            await this.organizationService.getOrganizationByID(aSubmission?.organization?._id)
        ];
        const results = await Promise.all(promises);
        const isOrgOwners = (results[0] || []).some((aUser) => isPermittedUser(aUser, userInfo));
        const isSubmitter = isPermittedUser(results[1], userInfo);
        const aOrganization = results[2];
        const isDataCurator = aOrganization?.conciergeID === userInfo?._id;
        const isPermittedAccess = this.userService.isAdmin(userInfo?.role) || isOrgOwners || isSubmitter || isDataCurator;
        if (!isPermittedAccess) {
            throw new Error(ERROR.INVALID_VALIDATE_METADATA)
        }
        // start validation, change validating status
        const [prevMetadataValidationStatus, prevFileValidationStatus] = [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus];
        await this.#updateValidationStatus(params?.types, aSubmission, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING);
        const result = await this.dataRecordService.validateMetadata(params._id, params?.types, params?.scope);
        // roll back validation if service failed
        if (!result.success) {
            await this.#updateValidationStatus(params?.types, aSubmission, prevMetadataValidationStatus, prevFileValidationStatus);
        }
        return result;
    }

    async submissionQCResults(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([
                ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR, // can see submission details for all submissions
                ROLES.ORG_OWNER, // can see submission details for submissions associated with his/her own organization
                ROLES.SUBMITTER, // can see submission details for his/her own submissions
                ROLES.DC_POC // can see submission details for submissions associated with his/her Data Commons
            ]);
        const submissionID = params?._id;
        const userRole = context.userInfo?.role;
        let submission = null;
        if ([ROLES.ORG_OWNER, ROLES.SUBMITTER, ROLES.DC_POC].includes(userRole)){
            submission = (await this.submissionCollection.find(submissionID)).pop();
        }
        if (!!submission && (
            (userRole === ROLES.ORG_OWNER && context.userInfo?.organization?.orgID !== submission?.organization?._id) ||
            (userRole === ROLES.SUBMITTER && context.userInfo._id !== submission?.submitterID) ||
            (userRole === ROLES.DC_POC && !context.userInfo?.dataCommons.includes(submission?.dataCommons))
        )){
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }
        return this.dataRecordService.submissionQCResults(params._id, params.first, params.offset, params.orderBy, params.sortDirection);
    }
    
    async listBatchFiles(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([
                ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR, // can see submission details for all submissions
                ROLES.ORG_OWNER, // can see submission details for submissions associated with his/her own organization
                ROLES.SUBMITTER, // can see submission details for his/her own submissions
                ROLES.DC_POC // can see submission details for submissions associated with his/her Data Commons
            ]);
        const userRole = context.userInfo?.role;
        let submission = null;
        if ([ROLES.ORG_OWNER, ROLES.SUBMITTER, ROLES.DC_POC].includes(userRole)){
            submission = (await this.submissionCollection.find(params.submissionID)).pop();
        }
        if (!!submission && (
            (userRole === ROLES.ORG_OWNER && context.userInfo?.organization?.orgID !== submission?.organization?._id) ||
            (userRole === ROLES.SUBMITTER && context.userInfo._id !== submission?.submitterID) ||
            (userRole === ROLES.DC_POC && !context.userInfo?.dataCommons.includes(submission?.dataCommons))
        )){
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }
        return this.dataRecordService.listBatchFiles(params.submissionID, params.batchID, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    // private function
    async #updateValidationStatus(types, aSubmission, metaStatus, fileStatus) {
        const typesToUpdate = {};
        if (!!aSubmission?.metadataValidationStatus && types.includes(VALIDATION.TYPES.METADATA)) {
            typesToUpdate.metadataValidationStatus = metaStatus;
        }

        if (!!aSubmission?.fileValidationStatus && types.includes(VALIDATION.TYPES.FILE)) {
            typesToUpdate.fileValidationStatus = fileStatus;
        }

        if (Object.keys(typesToUpdate).length === 0) {
            return;
        }
        const updated = await this.submissionCollection.update({_id: aSubmission?._id, ...typesToUpdate});
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            throw new Error(ERROR.FAILED_VALIDATE_METADATA);
        }
    }
}

const updateSubmissionStatus = async (submissionCollection, aSubmission, userInfo, newStatus) => {
    const newHistory = HistoryEventBuilder.createEvent(userInfo?._id, newStatus, null);
    aSubmission.history = [...(aSubmission.history || []), newHistory];
    const updated = await submissionCollection.update({...aSubmission, status: newStatus, updatedAt: getCurrentTime()});
    if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
        console.error(ERROR.UPDATE_SUBMISSION_ERROR, aSubmission?._id);
        throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
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
async function submissionActionNotification(userInfo, action, aSubmission, userService, organizationService, notificationService, tier) {
    switch(action) {
        case ACTIONS.SUBMIT:
            await sendEmails.submitSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.RELEASE:
            await sendEmails.releaseSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.WITHDRAW:
            await sendEmails.withdrawSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.REJECT:
            await sendEmails.rejectSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.COMPLETE:
            await sendEmails.completeSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.CANCEL:
            await sendEmails.cancelSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.ARCHIVE:
            //todo TBD send archived email
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
    const POCEmails = getUserEmails(results[3] || []);

    const aOrganization = results[4] || {};
    const curatorEmails = getUserEmails([{email: aOrganization?.conciergeEmail}]);

    // CCs for POCs, org owner, admins, curators
    const ccEmails = new Set([...POCEmails, ...orgOwnerEmails, ...adminEmails, ...curatorEmails]).toArray();
    const aSubmitter = results[2];
    return [ccEmails, aSubmitter, aOrganization];
}

const releaseSubmissionEmailInfo = async (userInfo, aSubmission, userService, organizationService) => {
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

const cancelOrRejectSubmissionEmailInfo = async (aSubmission, userService, organizationService) => {
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
    const ccEmails = new Set([orgOwnerEmails, curatorEmails, adminEmails]).toArray();
    return [ccEmails, aOrganization];
}

const sendEmails = {
    submitSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService, tier) => {
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
        const curatorEmails = getUserEmails([{email: aOrganization?.conciergeEmail}] || []);


        // CCs for org owner, Data Curator (or admins if not yet assigned exists)
        let ccEmailsVar 
        if(!aOrganization?.conciergeEmail){
            ccEmailsVar = adminEmails
        }else{
            ccEmailsVar = curatorEmails
        }
        const ccEmails = [...orgOwnerEmails, ...ccEmailsVar];
        await notificationService.submitDataSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
            idandname: `${aSubmission?.name} (ID: ${aSubmission?._id})`,
            dataconcierge: `${aSubmission?.conciergeName || 'NA'} at ${aSubmission?.conciergeEmail||'NA'}.`
            },tier
            
        );
    },
    completeSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService, tier) => {
        const [ccEmails, aSubmitter, aOrganization] = await completeSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        await notificationsService.completeSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
        }, {
            submissionName: aSubmission?.name,
            // only one study
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            conciergeName: aOrganization?.conciergeName || NA,
            conciergeEmail: aOrganization?.conciergeEmail || NA
        }, tier)
    },
    cancelSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService, tier) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await cancelOrRejectSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationService.cancelSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            canceledBy: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
            conciergeEmail: aOrganization?.conciergeEmail || NA,
            conciergeName: aOrganization?.conciergeName || NA
        }, tier);
    },
    withdrawSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService, tier) => {
        const aOrganization = await organizationService.getOrganizationByID(aSubmission?.organization?._id);
        const aCurator = await userService.getUserByID(aOrganization?.conciergeID);
        if (!aCurator) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, `id=${aSubmission?._id}`);
            return;
        }
        const promises = [
            await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
            await userService.getUserByID(aSubmission?.submitterID)
        ];
        const results = await Promise.all(promises);
        const orgOwnerEmails = getUserEmails(results[0] || []);
        const submitterEmails = getUserEmails([results[1]] || []);
        const ccEmails = new Set([...orgOwnerEmails, ...submitterEmails]).toArray();
        await notificationsService.withdrawSubmissionNotification(aCurator?.email, ccEmails, {
            firstName: `${aCurator.firstName} ${aCurator?.lastName || ''}`
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            // only one study
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            withdrawnByName: `${userInfo.firstName} ${userInfo?.lastName || ''}.`,
            withdrawnByEmail: `${userInfo?.email}`
        }, tier);
    },
    releaseSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService, tier) => {
        const [ccEmails, POCs, aOrganization] = await releaseSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (POCs.length === 0) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        // could be multiple POCs
        const notificationPromises = POCs.map(aUser =>
            notificationsService.releaseDataSubmissionNotification(aUser?.email, ccEmails, {
                firstName: `${aSubmission?.dataCommons} team`
            },{
                Tier: tier,
                dataCommonName: `${aSubmission?.dataCommons}`
            }, {
                idandname: `${aSubmission?.name} (id: ${aSubmission?._id})`,
                // only one study
                projectName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                dataconcierge: `${aSubmission?.conciergeName || NA} at ${aSubmission?.conciergeEmail || NA}`,
            })
        );
        await Promise.all(notificationPromises);
    },
    rejectSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService, tier) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await cancelOrRejectSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationService.rejectSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            conciergeEmail: aOrganization?.conciergeEmail || NA,
            conciergeName: aOrganization?.conciergeName || NA
        }, tier);
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
    if (!params.name || !params.studyAbbreviation || !params.dataCommons) {
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

const isSubmissionPermitted = (aSubmission, userInfo) => {
    const userRole = userInfo?.role;
    const allSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD, USER.ROLES.CURATOR];
    const isOrgOwner = userRole === USER.ROLES.ORG_OWNER && userInfo?.organization?.orgID === aSubmission?.organization?._id;
    const isSubmitter = userRole === USER.ROLES.SUBMITTER && userInfo?._id === aSubmission?.submitterID;
    const isPOC = userRole === USER.ROLES.DC_POC && userInfo?.dataCommons.includes(aSubmission?.dataCommons);

    if (allSubmissionRoles.includes(userRole) || isOrgOwner || isSubmitter || isPOC) {
        return;
    }
    throw new Error(ERROR.INVALID_STATS_SUBMISSION_PERMISSION);
}

class DataSubmission {
    constructor(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization) {
        this._id = v4();
        this.name = name;
        this.submitterID = userInfo._id;
        this.submitterName = formatName(userInfo);
        this.organization = {
            _id: userInfo?.organization?.orgID,
            name: userInfo?.organization?.orgName
        };
        this.dataCommons = dataCommons;
        this.modelVersion = "string for future use";
        this.studyAbbreviation = studyAbbreviation;
        this.dbGaPID = dbGaPID;
        this.status = NEW;
        this.history = [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)];
        this.bucketName = aUserOrganization.bucketName;
        this.rootPath = aUserOrganization.rootPath.concat(`/${this._id}`);
        this.conciergeName = aUserOrganization.conciergeName;
        this.conciergeEmail = aUserOrganization.conciergeEmail;
        this.createdAt = this.updatedAt = getCurrentTime();
        // file validations
        this.metadataValidationStatus = this.fileValidationStatus = VALIDATION_STATUS.NEW;
        this.fileErrors = [];
        this.fileWarnings = [];
    }

    static createSubmission(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization) {
        return new DataSubmission(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization);
    }
}


module.exports = {
    Submission
};

