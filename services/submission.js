const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS, EXPORT, INTENTION
} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession, verifyApiToken, verifySubmitter, validateToken} = require("../verifier/user-info-verifier");
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
const {AWSService} = require("../services/aws-request");
const {write2file} = require("../utility/io-util");

const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";
const NA = "NA"
const config = require("../config");
const ERRORS = require("../constants/error-constants");

// TODO: Data commons needs to be in a predefined list, currently only "CDS" and "ICDC" are allowed
// eventually frontend and backend will use same source for this list.
const dataCommonsTempList = ["CDS", "ICDC"];
const UPLOAD_TYPES = ['file','metadata'];
const LOG_DIR = 'logs';
const LOG_FILE_EXT_ZIP ='.zip';
const LOG_FILE_EXT_LOG ='.log';
const DATA_MODEL_SEMANTICS = 'semantics';
const DATA_MODEL_FILE_NODES = 'file-nodes';
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService, dataRecordService, tier, dataModelInfo, awsService, metadataQueueName) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
        this.dataRecordService = dataRecordService;
        this.tier = tier;
        this.dataModelInfo = dataModelInfo;
        this.modelVersion = this.#getModelVersion(dataModelInfo);
        this.awsService = awsService;
        this.metadataQueueName = metadataQueueName;
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

        const intention = [INTENTION.NEW, INTENTION.UPDATE, INTENTION.DELETE].find((i) => i.toLowerCase() === params?.intention.toLowerCase());
        if (!intention) {
            throw new Error(ERROR.CREATE_SUBMISSION_INVALID_INTENTION);
        }

        const newSubmission = DataSubmission.createSubmission(
            params.name, userInfo, params.dataCommons, params.studyAbbreviation, params.dbGaPID, aUserOrganization, this.modelVersion, intention);
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
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.DATA_FILE, BATCH.TYPE.FILE]);
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
        const res = await this.batchService.updateBatch(aBatch, params?.files, userInfo);
        // new status is ready for the validation
        if (res.status === BATCH.STATUSES.UPLOADED) {
            const updateSubmission = {
                _id: aSubmission._id,
                ...(res?.type === VALIDATION.TYPES.DATA_FILE ? {fileValidationStatus: VALIDATION_STATUS.NEW} : {}),
                updatedAt: getCurrentTime()
            }
            await this.submissionCollection.update(updateSubmission);
        }
        return res;
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
            if (aSubmission?.studyAbbreviation) {
                const submissions = await this.submissionCollection.aggregate([
                    {"$match": {$and: [
                        {studyAbbreviation: aSubmission.studyAbbreviation},
                        {status: {$in: [IN_PROGRESS, SUBMITTED]}},
                        {_id: { $not: { $eq: params._id}}}]}}]);
                const otherSubmissions = {[IN_PROGRESS]: [], [SUBMITTED]: []};
                submissions.forEach((submission) => {
                    otherSubmissions[submission.status].push(submission._id);
                });
                aSubmission.otherSubmissions = JSON.stringify(otherSubmissions);
            }
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
        verifier.isValidAction(params?.comment);
        //verify if user's role is valid for the action
        const newStatus = verifier.inRoles(userInfo);
        verifier.isValidSubmitAction(userInfo?.role, submission, params?.comment);
        //update submission
        let events = submission.history || [];
        // admin role and submit action only can leave a comment
        const isCommentRequired = ACTIONS.REJECT === action || (!verifier.isSubmitActionCommentRequired(submission, userInfo?.role, params?.comment));
        events.push(HistoryEventBuilder.createEvent(userInfo._id, newStatus, isCommentRequired ? params?.comment : null));
        submission = {
            ...submission,
            status: newStatus,
            history: events,
            updatedAt: getCurrentTime(),
            reviewComment: submission?.reviewComment || []
        }
        const updated = await this.submissionCollection.update(submission);
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
        }

        // Send complete action
        const completePromise = [];
        if (action === ACTIONS.COMPLETE) {
            completePromise.push(this.#sendCompleteMessage({type: "Complete Submission", submissionID}, submissionID));
        }

        //log event and send notification
        const logEvent = SubmissionActionEvent.create(userInfo._id, userInfo.email, userInfo.IDP, submission._id, action, fromStatus, newStatus);
        await Promise.all([
            this.logCollection.insert(logEvent),
            submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService, this.tier)
        ].concat(completePromise));
        return submission;
    }

    async #sendCompleteMessage(msg, submissionID) {
        try {
            await this.awsService.sendSQSMessage(msg, submissionID, submissionID, this.metadataQueueName);
        } catch (e) {
            console.error(ERRORS.FAILED_COMPLETE_SUBMISSION, `submissionID:${submissionID}`, `queue-name:${this.metadataQueueName}`, `error:${e}`);
        }
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
        const [prevMetadataValidationStatus, prevFileValidationStatus, prevCrossSubmissionStatus, prevTime] =
            [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus, aSubmission?.crossSubmissionStatus, aSubmission?.updatedAt];

        await this.#updateValidationStatus(params?.types, aSubmission, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, getCurrentTime());
        const result = await this.dataRecordService.validateMetadata(params._id, params?.types, params?.scope);
        // roll back validation if service failed
        if (!result.success) {
            if (result.message && result.message.includes(ERROR.NO_VALIDATION_METADATA)) {
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) 
                    await this.#updateValidationStatus(params?.types, aSubmission, null, prevFileValidationStatus, null, getCurrentTime());
                else {
                    await this.#updateValidationStatus(params?.types, aSubmission, null, "NA", null, getCurrentTime());
                    result.success = true;
                }
            } 
            else if (result.message && result.message.includes(ERROR.NO_NEW_VALIDATION_METADATA)){
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE))
                    await this.#updateValidationStatus(params?.types, aSubmission, prevMetadataValidationStatus, prevFileValidationStatus, null, prevTime);
                else {
                    await this.#updateValidationStatus(params?.types, aSubmission, prevMetadataValidationStatus, "NA", null, prevTime);
                    result.success = true;
                }
            } else if (result.message && result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION)) {
                await this.#updateValidationStatus(params?.types, aSubmission, null, null, prevCrossSubmissionStatus, prevTime);
            } else {
                const metadataValidationStatus = result.message.includes(ERROR.FAILED_VALIDATE_METADATA) ? prevMetadataValidationStatus : "NA";
                const fileValidationStatus = (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) ? prevFileValidationStatus : "NA";
                const crossSubmissionStatus = result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION) ? prevCrossSubmissionStatus : "NA";
                await this.#updateValidationStatus(params?.types, aSubmission, metadataValidationStatus, fileValidationStatus, crossSubmissionStatus, prevTime);
            }
        }
        return result;
    }
    /**
     * API to export dataRecords of the submission to tsv file by async process
     * @param {*} params 
     * @param {*} context 
     * @returns AsyncProcessResult
     */
    async exportSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.CURATOR]);
        const aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        const userInfo = context.userInfo;
        const isPermitted = (this.userService.isAdmin(userInfo.role) || userInfo.role === ROLES.CURATOR) 
        if (!isPermitted) {
            throw new Error(ERROR.INVALID_EXPORT_METADATA);
        }
        if (aSubmission.status !== SUBMITTED) {
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${EXPORT}!`);
        }
        return await this.dataRecordService.exportMetadata(params._id);
    }
    
    async submissionQCResults(params, context) {
        if (!(await this.#verifyQCResultsReadPermissions(context, params?._id))){
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }
        return this.dataRecordService.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async listSubmissionNodeTypes(params, context) {
        const submissionID = params?._id;
        if (!(await this.#verifyQCResultsReadPermissions(context, submissionID))){
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_NODE_TYPES);
        }
        return this.dataRecordService.listSubmissionNodeTypes(submissionID)
    }

    async listSubmissionNodes(params, context) {
        verifySession(context)
            .verifyInitialized()
        const result = await this.dataRecordService.submissionNodes(params.submissionID, params.nodeType, 
            params.first, params.offset, params.orderBy, params.sortDirection);

        let returnVal = {
            total: result.total,
            properties: [],
            nodes: []
        };
        if (result.results && result.results.length > 0){
            let propsSet = new Set();
            for (let node of result.results) {
                if (node.parents && node.parents.length > 0) {
                    for (let parent of node.parents) {
                        node.props[`${parent.parentType}.${parent.parentIDPropName}`] = parent.parentIDValue;
                    }
                }
                if (node.props && Object.keys(node.props).length > 0){
                    Object.keys(node.props).forEach(propsSet.add, propsSet);
                }
                node.props = JSON.stringify(node.props);
                delete node.parents;
                returnVal.nodes.push(node);
            }
            returnVal.properties = Array.from(propsSet);
        }
        return returnVal;
    }
    /**
     * API: getUploaderCLIConfigs for submitter to download a config file
     * @param {*} params 
     * @param {*} context 
     * @returns yaml string
     */
    async getUploaderCLIConfigs(params, context){
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        //only the submitter of current submission can download the configuration file for data file uploading
        await verifyBatchPermission(this.userService, aSubmission, context.userInfo);
        //set parameters
        const parameters = {submissionID: params.submissionID, apiURL: params.apiURL, 
            dataFolder: (params.dataFolder)?  params.dataFolder : "/Users/my_name/my_files",
            manifest: (params.manifest)? params.manifest: "/Users/my_name/my_manifest.tsv"
        }
        //get the uploader CLI config template as string
        var configString = config.uploaderCLIConfigs;
        //insert params values into the string
        configString = configString.format(parameters);
        //insert data model file node properties into the string
        configString = this.#replaceFileNodeProps(aSubmission, configString);
        //insert token into the string
        configString = await this.#replaceToken(context, configString);
        /** test code: write yaml string to file for verification of output
        write2file(configString, "logs/userUploaderConfig.yaml")
        end test code **/
        return configString;
    }

    #replaceFileNodeProps(aSubmission, configString){
        const modelFileNodeInfos = Object.values(this.dataModelInfo?.[aSubmission.dataCommons]?.[DATA_MODEL_SEMANTICS]?.[DATA_MODEL_FILE_NODES]);
        if (modelFileNodeInfos.length > 0){
            return configString.format(modelFileNodeInfos[0]);
        }
        else{
            throw new Error(ERROR.INVALID_DATA_MODEL);
        }
    }

    async #replaceToken(context, configString){
        //check user's token
        const tokens = context.userInfo?.tokens;
        if (tokens && tokens.length > 0 && validateToken(tokens[tokens.length-1], config.token_secret)) {
            return configString.format({token: tokens[tokens.length-1]})
        }
        const tokenDict = await this.userService.grantToken(null, context);
        if (!tokenDict || !tokenDict.tokens || tokenDict.tokens.length === 0){
            throw new Error(ERROR.INVALID_TOKEN_EMPTY);
        }
        return configString.format({token: tokenDict.tokens[0]})
    }

    async #verifyQCResultsReadPermissions(context, submissionID){
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
        if ([ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR].includes(userRole)){
            return true;
        }
        if ([ROLES.ORG_OWNER, ROLES.SUBMITTER, ROLES.DC_POC].includes(userRole)){
            submission = (await this.submissionCollection.find(submissionID)).pop();
        }
        return !!submission && (
            (userRole === ROLES.ORG_OWNER && context.userInfo?.organization?.orgID === submission?.organization?._id) ||
            (userRole === ROLES.SUBMITTER && context.userInfo._id === submission?.submitterID) ||
            (userRole === ROLES.DC_POC && context.userInfo?.dataCommons.includes(submission?.dataCommons))
        );
    }

    // private function
    async #updateValidationStatus(types, aSubmission, metaStatus, fileStatus, crossSubmissionStatus, updatedTime) {
        const typesToUpdate = {};
        if (crossSubmissionStatus && crossSubmissionStatus !== "NA") {
            typesToUpdate.crossSubmissionStatus = crossSubmissionStatus;
        }

        if (!!aSubmission?.metadataValidationStatus && types.includes(VALIDATION.TYPES.METADATA)) {
            if (metaStatus !== "NA")
                typesToUpdate.metadataValidationStatus = metaStatus;
        }

        if (!!aSubmission?.fileValidationStatus && types.some(type => (type?.toLowerCase() === VALIDATION.TYPES.DATA_FILE || type?.toLowerCase() === VALIDATION.TYPES.FILE))) {
            if (fileStatus !== "NA")
                typesToUpdate.fileValidationStatus = fileStatus;
        }

        if (Object.keys(typesToUpdate).length === 0) {
            return;
        }
        const updated = await this.submissionCollection.update({_id: aSubmission?._id, ...typesToUpdate, updatedAt: updatedTime});
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            throw new Error(ERROR.FAILED_VALIDATE_METADATA);
        }
    }

    #getModelVersion(dataModelInfo) {
        const modelVersion = dataModelInfo?.["CDS"]?.["current-version"];
        if (modelVersion) {
            return modelVersion;
        }
        throw new Error(ERROR.INVALID_DATA_MODEL_VERSION);
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
String.prototype.format = function(placeholders) {
    var s = this;
    for(var propertyName in placeholders) {
        var re = new RegExp('{' + propertyName + '}', 'gm');
        s = s.replace(re, placeholders[propertyName]);
    }    
    return s;
};

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
    constructor(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization, modelVersion, intention) {
        this._id = v4();
        this.name = name;
        this.submitterID = userInfo._id;
        this.submitterName = formatName(userInfo);
        this.organization = {
            _id: userInfo?.organization?.orgID,
            name: userInfo?.organization?.orgName
        };
        this.dataCommons = dataCommons;
        this.modelVersion = modelVersion;
        this.studyAbbreviation = studyAbbreviation;
        this.dbGaPID = dbGaPID;
        this.status = NEW;
        this.history = [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)];
        this.bucketName = aUserOrganization.bucketName;
        this.rootPath = aUserOrganization.rootPath.concat(`/${this._id}`);
        this.conciergeName = aUserOrganization.conciergeName;
        this.conciergeEmail = aUserOrganization.conciergeEmail;
        this.createdAt = this.updatedAt = getCurrentTime();
        // no metadata to be validated
        this.metadataValidationStatus = this.fileValidationStatus = this.crossSubmissionStatus = null;
        this.fileErrors = [];
        this.fileWarnings = [];
        this.intention = intention;
    }

    static createSubmission(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization, modelVersion, intention) {
        return new DataSubmission(name, userInfo, dataCommons, studyAbbreviation, dbGaPID, aUserOrganization, modelVersion, intention);
    }
}


module.exports = {
    Submission
};

