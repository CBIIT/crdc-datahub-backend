const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS, INTENTION, DATA_TYPE, DELETED, DATA_FILE,
    CONSTRAINTS, COLLABORATOR_PERMISSIONS, UPLOADING_HEARTBEAT_CONFIG_TYPE
} = require("../constants/submission-constants");
const fs = require('fs');
const path = require('path');
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession} = require("../verifier/user-info-verifier");
const {verifySubmissionAction} = require("../verifier/submission-verifier");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {SubmissionActionEvent, DeleteRecordEvent, UpdateSubmissionNameEvent, UpdateSubmissionConfEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const SubmissionDAO = require("../dao/submission");
// const {write2file} = require("../utility/io-util") //keep the line for future testing.

const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";
const NA = "NA"
const config = require("../config");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {isUndefined, replaceErrorString, isValidFileExtension, fileSizeFormatter} = require("../utility/string-util");
const {NODE_RELATION_TYPES} = require("./data-record-service");
const {verifyToken} = require("../verifier/token-verifier");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {EMAIL_NOTIFICATIONS: EN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const { isAllStudy } = require("../utility/study-utility");
const {getDataCommonsDisplayNamesForSubmission, getDataCommonsDisplayNamesForListSubmissions,
    getDataCommonsDisplayNamesForUser, getDataCommonsDisplayNamesForReleasedNode
} = require("../utility/data-commons-remapper");
const {formatNestedOrganization} = require("../utility/organization-transformer");
const {UserScope} = require("../domain/user-scope");
const {ORGANIZATION_COLLECTION, APPROVED_STUDIES_COLLECTION, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {zipFilesInDir} = require("../utility/io-util");
const PendingPVDAO = require("../dao/pendingPV");
const sanitizeHtml = require("sanitize-html");
const {SORT: PRISMA_SORT} = require("../constants/db-constants");
const prisma = require("../prisma");
const ProgramDAO = require("../dao/program");
const UserDAO = require("../dao/user");
const ApprovedStudyDAO = require("../dao/approvedStudy");
const ValidationDAO = require("../dao/validation");
const DataRecordDAO = require("../dao/dataRecords");
const PERMISSION_SCOPES = require("../constants/permission-scope-constants");
const BatchDAO = require("../dao/batch");
const FILE = "file";
const ApplicationDAO = require("../dao/application");

const DATA_MODEL_SEMANTICS = 'semantics';
const DATA_MODEL_FILE_NODES = 'file-nodes';
const COMPLETE_SUBMISSION = "Complete Submission";
const RESTORE_DELETED_DATA_FILES = "Restore Deleted Data Files";
const DELETE_METADATA = "Delete Metadata";
const INACTIVE_REMINDER = "inactiveReminder";
const FINAL_INACTIVE_REMINDER = "finalInactiveReminder";

const SUBMISSION_ID = "Submission ID";
const DATA_SUBMISSION_TYPE = "Data Submission Type";
const DESTINATION_LOCATION = "Destination Location";
const MAX_COMMENT_LENGTH = 500;
const MAX_SUBMISSION_NAME_LENGTH = 25;
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    _NOT_ASSIGNED = "Not yet assigned";
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService,
                dataRecordService, fetchDataModelInfo, awsService, metadataQueueName, s3Service, emailParams, dataCommonsList,
                hiddenDataCommonsList, validationCollection, sqsLoaderQueue, qcResultsService, uploaderCLIConfigs, 
                submissionBucketName, configurationService, uploadingMonitor, dataCommonsBucketMap, authorizationService, dataModelService, dataRecordsCollection) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
        this.dataRecordService = dataRecordService;
        this.dataRecordDAO = new DataRecordDAO(dataRecordsCollection)
        this.fetchDataModelInfo = fetchDataModelInfo;
        this.awsService = awsService;
        this.metadataQueueName = metadataQueueName;
        this.s3Service = s3Service;
        this.emailParams = emailParams;
        this.allowedDataCommons = new Set(dataCommonsList);
        this.hiddenDataCommons = new Set(hiddenDataCommonsList);
        this.validationCollection = validationCollection;
        this.sqsLoaderQueue = sqsLoaderQueue;
        this.qcResultsService = qcResultsService;
        this.uploaderCLIConfigs = uploaderCLIConfigs;
        this.submissionBucketName = submissionBucketName;
        this.configurationService = configurationService;
        this.uploadingMonitor = uploadingMonitor;
        this.dataCommonsBucketMap = dataCommonsBucketMap;
        this.authorizationService = authorizationService;
        this.pendingPVDAO = new PendingPVDAO();
        this.submissionDAO = new SubmissionDAO(this.submissionCollection, this.organizationService.organizationCollection);
        this.dataModelService = dataModelService;
        this.programDAO = new ProgramDAO();
        this.userDAO = new UserDAO();
        this.batchDAO = new BatchDAO();
        this.approvedStudyDAO = new ApprovedStudyDAO();
        this.validationDAO = new ValidationDAO();
        this.applicationDAO = new ApplicationDAO();
    }

    /**
     * Helper method to create update data objects with common fields
     * @param {Object} data - The data to include in the update
     * @param {boolean|Date} includeTimestamp - Whether to include updatedAt timestamp (default: true) or custom Date object
     * @returns {Object} - The prepared update data object
     */
    _prepareUpdateData(data = {}, includeTimestamp = true) {
        const updateData = { ...data };
        if (includeTimestamp) {
            updateData.updatedAt = includeTimestamp === true ? getCurrentTime() : includeTimestamp;
        }
        return updateData;
    }

    /**
     * Appends submissionRequestID and canViewSubmissionRequest fields to submission(s)
     * @param {Object|Array|null} submissions - Single submission, array of submissions, or null/undefined
     * @param {Object} userInfo - Current user's info
     * @returns {Promise<Object|Array|null>} Enriched submission(s), or null/undefined if input was null/undefined
     */
    async _appendSubmissionRequestAndViewPermissions(submissions, userInfo) {
        // Return early if submissions is null/undefined
        if (submissions == null) {
            return submissions;
        }
        
        const isArray = Array.isArray(submissions);
        const submissionList = isArray ? submissions : [submissions];
        
        // Collect unique applicationIDs that need ownership check
        const applicationIDs = [...new Set(
            submissionList
                .map(s => s.submissionRequestID)
                .filter(Boolean)
        )];
        
        // If no applicationIDs, skip permission check and return early
        if (applicationIDs.length === 0) {
            const enriched = submissionList.map(s => ({
                ...s,
                canViewSubmissionRequest: false
            }));
            return isArray ? enriched : enriched[0];
        }
        
        // Get user's scope for SUBMISSION_REQUEST.VIEW permission
        const validScopes = await this.authorizationService.getPermissionScope(
            userInfo, 
            USER_PERMISSION_CONSTANTS.SUBMISSION_REQUEST.VIEW
        );
        const userScope = UserScope.create(validScopes);
        
        // If user has no permission, set all to false
        if (userScope.isNoneScope()) {
            const enriched = submissionList.map(s => ({
                ...s,
                canViewSubmissionRequest: false
            }));
            return isArray ? enriched : enriched[0];
        }
        
        // If ALL scope, set all with applicationID to true
        if (userScope.isAllScope()) {
            const enriched = submissionList.map(s => ({
                ...s,
                canViewSubmissionRequest: !!s.submissionRequestID
            }));
            return isArray ? enriched : enriched[0];
        }
        
        // OWN scope - batch load applications to check ownership
        const applications = await this.applicationDAO.findMany({
            id: { in: applicationIDs }
        }, {
            select: { id: true, applicantID: true }
        });
        
        const applicantMap = new Map(
            applications.map(app => [app.id, app.applicantID])
        );
        
        const enriched = submissionList.map(s => ({
            ...s,
            canViewSubmissionRequest: s.submissionRequestID 
                ? applicantMap.get(s.submissionRequestID) === userInfo?._id
                : false
        }));
        
        return isArray ? enriched : enriched[0];
    }

    async createSubmission(params, context) {
        verifySession(context)
            .verifyInitialized();
        // Check user permission to create submission
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        // User has ALL scope - can create submissions for any study
        if (!userScope.isAllScope()) {
            // User has OWN or STUDY scope - must be assigned to the study
            if (userScope.isOwnScope() || userScope.isStudyScope()) {
                const hasStudyAccess = validateStudyAccess(context?.userInfo?.studies, params.studyID);
                if (!hasStudyAccess) {
                    throw new Error(ERROR.INVALID_STUDY_ACCESS);
                }
            }
            // User has DC scope - must have data commons access (no study assignment required)
            else if (userScope.isDCScope()) {
                const userDataCommons = context?.userInfo?.dataCommons || [];
                const hasDataCommonsAccess = validateDataCommonsAccess(userDataCommons, params.dataCommons);
                if (!hasDataCommonsAccess) {
                    throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
                }
            }
            else {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
        }

        const intention = [INTENTION.UPDATE, INTENTION.DELETE].find((i) => i.toLowerCase() === params?.intention.toLowerCase());
        const dataType = [DATA_TYPE.METADATA_AND_DATA_FILES, DATA_TYPE.METADATA_ONLY].find((i) => i.toLowerCase() === params?.dataType.toLowerCase());
        validateCreateSubmissionParams(params, this.allowedDataCommons, this.hiddenDataCommons, intention, dataType, context?.userInfo);
        const [approvedStudies, modelVersion, program] = await Promise.all([
            this._findApprovedStudies([params.studyID]),
            (async () => {
                const latestDataModel = await this.fetchDataModelInfo();
                return this._getModelVersion(latestDataModel, params.dataCommons);
            })(),
            (async () => {
                const program = await this.organizationService.findOneByStudyID(params?.studyID);
                if (program) {
                    return program;
                }
                const NAProgram = await this.programDAO.findFirst({name: NA});
                if (!NAProgram) {
                    console.error(`no NA program exists in the database`)
                }
                return NAProgram ? NAProgram : null;
            })(),
        ]);

        if (approvedStudies.length === 0) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }

        if (!program) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_ASSOCIATED_PROGRAM);
        }

        let approvedStudy = approvedStudies[0];
        if (approvedStudy.controlledAccess && !approvedStudy?.dbGaPID) {
            throw new Error(ERROR.MISSING_CREATE_SUBMISSION_DBGAPID);
        }

        if (approvedStudy.controlledAccess && approvedStudy?.isPendingGPA) {
            throw new Error(ERROR.MISSING_CREATE_SUBMISSION_PENDING_GPA);
        }

        if (isTrue(approvedStudy?.pendingModelChange)) {
            throw new Error(ERROR.PENDING_APPROVED_STUDY);
        }

        if (approvedStudy?.primaryContactID) {
            approvedStudy.primaryContact = await this.userService.getUserByID(approvedStudy.primaryContactID)
        }
        const newSubmission = getDataCommonsDisplayNamesForSubmission(DataSubmission.createSubmission(
            params.name, context.userInfo, params.dataCommons, approvedStudy?.dbGaPID, program, modelVersion, intention, dataType, approvedStudy, this.submissionBucketName));

        const created = await this.submissionDAO.create(newSubmission);
        if (!created) {
            throw new Error(ERROR.CREATE_SUBMISSION_INSERTION_ERROR);
        }

        const res = await this.submissionDAO.update(created?.id, {rootPath: `${SUBMISSIONS}/${created?.id}`})
        if (!res) {
            throw new Error(ERROR.CREATE_SUBMISSION_INSERTION_ERROR);
        }
        const updateSubmission = await this._findByID(res?._id)
        await this._remindPrimaryContactEmail(updateSubmission, approvedStudy, program);
        return this._findByID(res?._id);
    }
    async _findApprovedStudies(studies) {
        if (!studies || studies.length === 0) return [];
        const studiesIDs = studies.map((study) => {
            if (study && study instanceof Object && (study?._id || study?.id)) {
                return study._id || study.id;
            }
            return study;
        }).filter(studyID => studyID !== null && studyID !== undefined); // Filter out null/undefined values
        return this.approvedStudyDAO.findMany({
            id: {in: studiesIDs}
        });
    }

    async listSubmissions(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for listSubmissions, returning empty list");
            return {submissions: [], total: 0};
        }
        const dataCommonsList = Array.from(this.allowedDataCommons).filter(dc => !this.hiddenDataCommons.has(dc));
        const res = await this.submissionDAO.listSubmissions(context?.userInfo, userScope, params, dataCommonsList);
        const transformedRes = getDataCommonsDisplayNamesForListSubmissions(res);
        // Add canViewSubmissionRequest field to submissions
        transformedRes.submissions = await this._appendSubmissionRequestAndViewPermissions(transformedRes?.submissions, context?.userInfo);
        return transformedRes;
    }

    async createBatch(params, context) {
        // updated to handle both API-token and session.
        const userInfo = context?.userInfo
        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.DATA_FILE]);
        const aSubmission = await this._findByID(params.submissionID);
        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        this._verifyBatchPermission(aSubmission, userInfo, viewScope);

        // The submission status must be valid states
        if (![NEW, IN_PROGRESS ,WITHDRAWN, REJECTED].includes(aSubmission?.status)) {
            throw new Error(ERROR.INVALID_SUBMISSION_STATUS);
        }

        if (INTENTION.DELETE === aSubmission?.intention && params?.type === BATCH.TYPE.DATA_FILE) {
            throw new Error(ERROR.INVALID_BATCH_INTENTION);
        }

        if (!aSubmission?.bucketName || aSubmission?.bucketName?.trim()?.length === 0) {
            throw new Error(ERROR.NO_SUBMISSION_BUCKET);
        }

        if (DATA_TYPE.METADATA_ONLY === aSubmission?.dataType && params?.type === BATCH.TYPE.DATA_FILE) {
            throw new Error(ERROR.INVALID_BATCH_DATA_TYPE);
        }

        if (params?.type === BATCH.TYPE.DATA_FILE && (!aSubmission.dataCommons || !aSubmission.studyID)) {
            throw new Error(ERROR.MISSING_REQUIRED_SUBMISSION_DATA);
        }

        const invalidFiles = params?.files
            .filter((fileName) => !isValidFileExtension(fileName))
            .map((fileName) => `'${fileName}'`);
        if (invalidFiles.length > 0) {
            throw new Error(replaceErrorString(ERROR.INVALID_FILE_EXTENSION, invalidFiles?.join(",")));
        }

        const result = await this.batchService.createBatch(params, aSubmission, userInfo);
        // The submission status needs to be updated after createBatch
        if ([NEW, WITHDRAWN, REJECTED].includes(aSubmission?.status)) {
            await updateSubmissionStatus(this.submissionDAO, aSubmission, userInfo, IN_PROGRESS);
        }
        return result;
    }

    async updateBatch(params, context) {
        const userInfo = context?.userInfo;
        verifyBatch(params)
            .isValidBatchID()
            .notEmpty();

        const aBatch = await this.batchService.findByID(params?.batchID);
        if (!aBatch) {
            throw new Error(ERROR.BATCH_NOT_EXIST);
        }

        const aSubmission = await this._findByID(aBatch.submissionID);

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        this._verifyBatchPermission(aSubmission, userInfo, viewScope);

        // check if it's a heartbeat call sent by CLI of uploading data file.
        // CLI uploader sends uploading heartbeat every 5 min by calling the API with a parameter, uploading: true
        if (params?.uploading === true) {
            //save the batch in the uploading batch pool for monitoring heart beat
            this.uploadingMonitor.saveUploadingBatch(aBatch._id);
            return {}
        }
        else {
            // remove uploading batch from the uploading batch pool if uploading is completed or failed
            this.uploadingMonitor.removeUploadingBatch(aBatch._id);
            // check files if any success == false and error contains 'File uploading is interrupted.'
            if (params?.files?.some((file) => file?.succeeded === false && file?.errors?.includes(ERROR.UPLOADING_BATCH_INTERRUPTED))) {
                // update the batch status to failed
                await this.uploadingMonitor.setUploadingFailed(aBatch._id, BATCH.STATUSES.FAILED, ERROR.UPLOADING_BATCH_INTERRUPTED, true);
                return {
                    _id: aBatch._id,
                    submissionID: aBatch.submissionID,
                    type: aBatch.type,
                    fileCount: aBatch.fileCount,
                    status: BATCH.STATUSES.FAILED,
                    updatedAt: getCurrentTime(),
                }
            }
        }
        if (![BATCH.STATUSES.UPLOADING].includes(aBatch?.status)) {
            throw new Error(ERROR.INVALID_UPDATE_BATCH_STATUS);
        }

        const res = await this.batchService.updateBatch(aBatch, aSubmission?.bucketName, params?.files);
        // new status is ready for the validation
        if (res.status === BATCH.STATUSES.UPLOADED) {
            // Prepare update data for Prisma
            const updateData = this._prepareUpdateData({
                ...(res?.type === VALIDATION.TYPES.DATA_FILE ? {fileValidationStatus: VALIDATION_STATUS.NEW} : {})
            });
            
            // Update submission using Prisma DAO instead of MongoDB collection
            const updatedSubmission = await this.submissionDAO.update(aSubmission._id, updateData);
            if (!updatedSubmission) {
                throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
            }
        }
        return res;
    }

    async listBatches(params, context) {
        verifySession(context)
            .verifyInitialized();

        const aSubmission = await this._findByID(params?.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        return await this.batchService.listBatches(params);
    }

  async getSubmission(params, context){
        verifySession(context)
            .verifyInitialized();

        let aSubmission = await this._findByID(params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        const isNotPermitted = viewScope.isNoneScope();
        if (isNotPermitted) {
          throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        if (!userHasValidScope(context?.userInfo?._id, viewScope, context?.userInfo?.studies, context?.userInfo?.dataCommons, aSubmission)) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        await Promise.all([
            // Store data file size into submission document
            (async () => {
                const dataFileSize = await this._getS3DirectorySize(aSubmission?.bucketName, `${aSubmission?.rootPath}/${FILE}/`);
                const isDataFileChanged = aSubmission?.dataFileSize?.size !== dataFileSize.size || aSubmission?.dataFileSize?.formatted !== dataFileSize.formatted;
                if (isDataFileChanged) {
                    const updatedSubmission = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({dataFileSize}));
                    if (!updatedSubmission) {
                        throw new Error(ERROR.FAILED_RECORD_FILESIZE_PROPERTY, `SubmissionID: ${aSubmission?._id}`);
                    }
                }
                aSubmission.dataFileSize = dataFileSize;
            })(),
            // Get other submissions for the same study
            (async () => {
                if (aSubmission?.studyID) {
                    const submissions = await this.submissionDAO.findMany({
                        studyID: aSubmission.studyID,
                        dataCommons: aSubmission.dataCommons,
                        status: {
                            in: [IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN],
                        },
                        NOT: {
                            id: params._id,
                        },
                    });
                    const otherSubmissions = {
                          [IN_PROGRESS]: [],
                          [SUBMITTED]: [],
                          [RELEASED]: [],
                          [REJECTED]: [],
                          [WITHDRAWN]: [],
                    };
                    submissions.forEach((submission) => {
                        otherSubmissions[submission.status].push(submission._id);
                    });
                    aSubmission.otherSubmissions = JSON.stringify(otherSubmissions);
                }
            })(),
            // dynamically calculate the node-count for the submission.
            (async () => {
              if (!aSubmission?.archived) {
                  const submissionNodeCount = await this.dataRecordService.countNodesBySubmissionID(aSubmission?._id);
                  if (aSubmission.nodeCount !== submissionNodeCount) {
                      const updatedNodeCount = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({nodeCount: submissionNodeCount}));
                      if (!updatedNodeCount) {
                          console.error(`Failed to update the node count; submissionID: ${aSubmission?._id}`);
                      }
                      aSubmission.nodeCount = submissionNodeCount;
                  }
              }
            })(),
            // add userName in each history
            (async () => {
              if (aSubmission?.history && Array.isArray(aSubmission.history)) {
                  const userIDs = aSubmission.history
                      .filter(history => !history?.userName && history?.userID)
                      .map(history => history.userID);
                  
                  if (userIDs.length > 0) {
                      const uniqueUserIDs = [...new Set(userIDs)];
                      
                      try {
                          // Fetch all users by their IDs in a batch call
                          const users = await this.userService.getUsersByIDs(uniqueUserIDs);
                          
                          const userMap = {};
                          users.forEach(user => {
                              if (user) {
                                  userMap[user._id] = `${user.firstName} ${user.lastName}`;
                              }
                          });
                          
                          aSubmission.history.forEach(history => {
                              if (!history?.userName && history?.userID && userMap[history.userID]) {
                                  history.userName = userMap[history.userID];
                              }
                          });
                      } catch (error) {
                          // Log error but don't fail the entire operation
                          // History entries will remain without userNames populated
                          console.error(`Failed to fetch user names for history entries in submission ${aSubmission._id}:`, error);
                          console.error(`Affected userIDs:`, uniqueUserIDs);
                      }
                  }
              }
            })(),
            (async () => {
                if (aSubmission?.collaborators?.length > 0) {
                    const collabIDs = Array.from(
                        new Set((aSubmission?.collaborators ?? [])
                            .map(c => c?.collaboratorID)
                            .filter(Boolean))
                    );

                    const users = await this.userDAO.findMany({id: {in: collabIDs || []}});
                    const userById = new Map(users.map(u => [String(u?._id), u]));
                    aSubmission?.collaborators.forEach(collaborator => {
                        const user = userById.get(String(collaborator?.collaboratorID));
                        const isValidStudy = this._verifyStudyInUserStudies(user, aSubmission?.studyID);
                        collaborator.permission = (user?.role === ROLES.SUBMITTER && isValidStudy) ? COLLABORATOR_PERMISSIONS.CAN_EDIT : COLLABORATOR_PERMISSIONS.NO_ACCESS;
                    });
                }
            })(),
        ]);

        // Store the timestamp for the inactive submission purpose
        const conditionSubmitter = (context?.userInfo?.role === ROLES.SUBMITTER) && (context?.userInfo?._id === aSubmission?.submitterID);
        if (conditionSubmitter) {
            const everyReminderDays = this._getEveryReminderQuery(this.emailParams.remindSubmissionDay, false);
            await this.submissionDAO.update(aSubmission?._id, {accessedAt: getCurrentTime(), ...everyReminderDays});
        }

        // The organization is already fetched in _findByID, so no need to fetch again
        // unless it's missing for some reason
        if (aSubmission.programID && !aSubmission.organization) {
            aSubmission.organization = await this.programDAO.findById(aSubmission.programID);
        }

        return getDataCommonsDisplayNamesForSubmission(aSubmission);
    }

    /**
     * Retrieve the total file size within the specified path in the S3 bucket.
     * @param {string} bucketName - The name of the S3 bucket.
     * @param {string} prefix - The path (prefix) within the S3 bucket.
     * @returns {Promise<{formatted: string, size: number}>}
     */
    async _getS3DirectorySize(bucketName, prefix){
        const dataFiles = await this.s3Service.listFileInDir(bucketName, prefix);
        const fileSize = dataFiles.reduce((sum, file) => sum + file.Size, 0);
        return FileSize.createFileSize(fileSize);
    }

    /**
     * API: submissionAction
     * @param {*} params 
     * @param {*} context 
     * @returns updated submission
     */
    async submissionAction(params, context){
        verifySession(context)
            .verifyInitialized()
        const {submissionID, action, comment} = params;
        let submission = await this._findByID(submissionID);
        if (!submission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST, submissionID);
        }
        const oldStatus = submission.status;
        const userInfo = context.userInfo;
        // verify if the action is valid based on current submission status
        const verifier = verifySubmissionAction(action, submission.status, comment);
        const collaboratorUserIDs = Collaborators.createCollaborators(submission?.collaborators).getEditableCollaboratorIDs();
        // User has valid permissions or collaborator, valid user scope, with the callback function
        if (!await verifier.isValidPermissions(action, userInfo, collaboratorUserIDs, async (...args) => {
            return await this._getUserScope(...args, submission);
        })) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        const newStatus = verifier.getNewStatus();
        const [userScope, dataFileSize, orphanedErrorFiles, uploadingBatches] = await Promise.all([
            this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.ADMIN_SUBMIT, submission),
            this._getS3DirectorySize(submission?.bucketName, `${submission?.rootPath}/${FILE}/`),
            this.qcResultsService.findBySubmissionErrorCodes(params.submissionID, ERRORS.CODES.F008_MISSING_DATA_NODE_FILE),
            this.batchService.findOneBatchByStatus(params.submissionID, BATCH.STATUSES.UPLOADING)
        ]);

        const submissionAttributes = SubmissionAttributes.create(!userScope.isNoneScope(), submission, dataFileSize?.size, orphanedErrorFiles?.length > 0, uploadingBatches.length > 0);
        verifier.isValidSubmitAction(!userScope.isNoneScope(), submission, params?.comment, submissionAttributes);
        await this._isValidReleaseAction(action, submission?._id, submission?.studyID, submission?.dataCommons, submission?.crossSubmissionStatus);
        //update submission
        let events = submission.history || [];
        // admin permission and submit action only can leave a comment
        const isCommentRequired = ACTIONS.REJECT === action || (!verifier.isSubmitActionCommentRequired(submission, !userScope.isNoneScope(), params?.comment));
        events.push(HistoryEventBuilder.createEvent(userInfo._id, newStatus, isCommentRequired ? params?.comment : null));

        // When the status changes to COMPLETED, store the total data size of the S3 directory in the submission document.
        if (newStatus === COMPLETED) {
            submission.dataFileSize = dataFileSize;
        }
        
        // Prepare update data for Prisma
        const updateData = this._prepareUpdateData({
            status: newStatus,
            history: events,
            reviewComment: submission?.reviewComment || ""
        });
        
        // Add dataFileSize if status is COMPLETED
        if (newStatus === COMPLETED) {
            updateData.dataFileSize = dataFileSize;
        }
        
        // Update submission using Prisma DAO
        const updated = await this.submissionDAO.update(submission._id, updateData);
        if (!updated) {
            throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
        }
        const updatedSubmission = await this._findByID(updated?._id);
        // Transform the updated submission to match expected format
        submission = getDataCommonsDisplayNamesForSubmission(updatedSubmission);
        
        // Send complete action
        const completePromise = [];
        if (action === ACTIONS.COMPLETE) {
            completePromise.push(this._sendCompleteMessage({type: COMPLETE_SUBMISSION, submissionID}, submissionID));
        }
        if (action === ACTIONS.RELEASE) {
            completePromise.push(this.dataRecordService.exportMetadata(submissionID));
        }
        if (action === ACTIONS.REJECT && submission?.intention === INTENTION.DELETE && oldStatus === RELEASED) {
            //based on CRDCDH-2338 to send a restoring deleted data file SQS message so validator can execute the restoration.
            completePromise.push(this._sendCompleteMessage({type: RESTORE_DELETED_DATA_FILES, submissionID}, submissionID));
        }

        //log event and send notification
        const logEvent = SubmissionActionEvent.create(userInfo._id, userInfo.email, userInfo.IDP, submission._id, action, verifier.getPrevStatus(), newStatus);
        
        // Create log entry using Prisma
        const logData = {
            userID: logEvent.userID,
            userEmail: logEvent.userEmail,
            userIDP: logEvent.userIDP,
            userName: logEvent.userName,
            eventType: logEvent.eventType,
            submissionID: logEvent.submissionID,
            action: logEvent.action,
            prevState: logEvent.prevState,
            newState: logEvent.newState,
            timestamp: Date.now() / 1000,
            localtime: new Date()
        };
        
        await Promise.all([
            this._createLogEntry(logData),
            submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService, this.emailParams, this.dataCommonsBucketMap),
            this._archiveCancelSubmission(action, submissionID, submission?.bucketName, submission?.rootPath)
        ].concat(completePromise));
        return submission;
    }

    async _archiveCancelSubmission(action, submissionID, bucketName, rootPath) {
        if (action === ACTIONS.CANCEL) {
            try {
                await this._archiveSubmission(submissionID, bucketName, rootPath);
                console.debug(`Successfully archive canceled submissions: ${submissionID}.`);
            } catch (e) {
                console.error(`Failed to delete files under archived canceled submission: ${submissionID} with error: ${e.message}.`);
            }
        }
    }

    async remindInactiveSubmission() {
        // The system sends an email reminder a day before the data submission expires
        const finalInactiveSubmissions = await this.submissionDAO.getInactiveSubmission(this.emailParams.finalRemindSubmissionDay - 1, FINAL_INACTIVE_REMINDER);
        if (finalInactiveSubmissions?.length > 0) {
            await Promise.all(finalInactiveSubmissions.map(async (aSubmission) => {
                await sendEmails.finalRemindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService);
            }));
            const submissionIDs = finalInactiveSubmissions
                .map(submission => submission._id);
            // Disable all reminders to ensure no notifications are sent.
            const everyReminderDays = this._getEveryReminderQuery(this.emailParams.remindSubmissionDay, true);
            const updatedReminder = await this.submissionDAO.updateMany(
                { id: { in: submissionIDs } }, 
                everyReminderDays
            );
            if (!updatedReminder?.count || updatedReminder?.count === 0) {
                console.error("The email reminder flag intended to notify the inactive submission user (FINAL) is not being stored", `submissionIDs: ${submissionIDs.join(', ')}`);
            }
        }
        // Map over inactiveDays to create an array of tuples [day, promise]
        const inactiveSubmissionPromises = [];
        for (const day of this.emailParams.remindSubmissionDay) {
            const pastInactiveDays = this.emailParams.finalRemindSubmissionDay - day;
            inactiveSubmissionPromises.push([pastInactiveDays, await this.submissionDAO.getInactiveSubmission(pastInactiveDays, `${INACTIVE_REMINDER}_${day}`)]);
        }
        const inactiveSubmissionResult = await Promise.all(inactiveSubmissionPromises);
        const inactiveSubmissionMapByDays = inactiveSubmissionResult.reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
        // For Sorting, the oldest submission about to expire submission will be sent at once.
        const sortedKeys = Object.keys(inactiveSubmissionMapByDays).sort((a, b) => b - a);
        let uniqueSet = new Set();  // Set to track used _id values
        sortedKeys.forEach((key) => {
            // Filter out _id values that have already been used
            inactiveSubmissionMapByDays[key] = inactiveSubmissionMapByDays[key].filter(obj => {
                if (!uniqueSet.has(obj._id)) {
                    uniqueSet.add(obj._id);
                    return true;  // Keep this object
                }
                return false;  // Remove this object as it's already been used
            });
        });

        if (uniqueSet.size > 0) {
            const emailPromises = [];
            let inactiveSubmissions = [];
            for (const [pastDays, aSubmissionArray] of Object.entries(inactiveSubmissionMapByDays)) {
                for (const aSubmission of aSubmissionArray) {
                    const emailPromise = (async (pastDays) => {
                        // by default, final reminder 120 days
                        const expiredDays = this.emailParams.finalRemindSubmissionDay - pastDays;
                        await sendEmails.remindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService, expiredDays, pastDays);
                    })(pastDays);
                    emailPromises.push(emailPromise);
                    inactiveSubmissions.push([aSubmission?._id, pastDays]);
                }
            }
            await Promise.all(emailPromises);
            const submissionReminderDays = this.emailParams.remindSubmissionDay;
            for (const inactiveSubmission of inactiveSubmissions) {
                const submissionID = inactiveSubmission[0];
                const pastDays = inactiveSubmission[1];
                const expiredDays = this.emailParams.finalRemindSubmissionDay - pastDays;
                const reminderDays = submissionReminderDays.filter((d) => expiredDays < d || expiredDays === d);
                // The submissions with the closest expiration dates will be flagged as true; no sent any notification anymore
                // A notification will be sent at each interval. ex) 7, 30, 60 days before expiration
                const reminderFilter = reminderDays.reduce((acc, day) => {
                    acc[`${INACTIVE_REMINDER}_${day}`] = true;
                    return acc;
                }, {});
                const updatedReminder = await this.submissionDAO.update(submissionID, reminderFilter);
                if (!updatedReminder) {
                    console.error("The email reminder flag intended to notify the inactive submission user is not being stored", submissionID);
                }
            }
        }

    }

    // Updated to filter by both studyID and dataCommons for cross validation scope - ticket CRDCDH-3247
    async _isValidReleaseAction(action, submissionID, studyID, dataCommons, crossSubmissionStatus) {
        if (action?.toLowerCase() === ACTIONS.RELEASE.toLowerCase()) {
            const submissions = await this.submissionDAO.findMany({
                studyID: studyID,
                dataCommons: dataCommons,
                NOT: {
                    id: submissionID
                }
            });
            // Throw error if other submissions associated with the same study AND data commons
            // are some of them are in "Submitted" status if cross submission validation is not Passed.
            if (submissions?.some(i => i?.status === SUBMITTED) && crossSubmissionStatus !== VALIDATION_STATUS.PASSED) {
                throw new Error(ERROR.VERIFY.INVALID_RELEASE_ACTION);
            }
        }
    }

    async _sendCompleteMessage(msg, submissionID) {
        try {
            await this.awsService.sendSQSMessage(msg, submissionID, submissionID, this.metadataQueueName);
        } catch (e) {
            console.error(ERRORS.FAILED_COMPLETE_SUBMISSION, `submissionID:${submissionID}`, `queue-name:${this.metadataQueueName}`, `error:${e}`);
        }
    }

    async submissionStats(params, context) {
        verifySession(context)
            .verifyInitialized();

        const aSubmission = await this._findByID(params?._id);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const submissionStats = await this.dataRecordService.submissionStats(aSubmission);

        return {
            submissionID: submissionStats?.submissionID || aSubmission._id,
            stats: submissionStats?.stats || []
        };
    }

    async validateSubmission(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await this._findByID(params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        const userInfo = context.userInfo;

        const createScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        const reviewScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, aSubmission);
        const isNotPermitted = !this._isCollaborator(userInfo, aSubmission) && createScope.isNoneScope() && reviewScope.isNoneScope();
        if (isNotPermitted) {
            throw new Error(ERROR.INVALID_VALIDATE_METADATA)
        }
        // if the user has review permission, and the submission status is "Submitted", and aSubmission?.crossSubmissionStatus is "Error",
        // and params.types not contains CROSS_SUBMISSION, add CROSS_SUBMISSION. User story CRDCDH-2830
        // Cross validation now only applies to submissions with same study AND data commons - ticket CRDCDH-3247
        if (reviewScope && !reviewScope.isNoneScope() && aSubmission?.status === SUBMITTED &&
            aSubmission?.crossSubmissionStatus === VALIDATION_STATUS.ERROR && params?.types &&
            !params?.types?.includes(VALIDATION.TYPES.CROSS_SUBMISSION)) {

            params.types.push(VALIDATION.TYPES.CROSS_SUBMISSION);
        }
        // start validation, change validating status
        const [prevMetadataValidationStatus, prevFileValidationStatus, prevCrossSubmissionStatus, prevTime] =
            [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus, aSubmission?.crossSubmissionStatus, aSubmission?.updatedAt];

        await this._updateValidationStatus(params?.types, aSubmission, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, getCurrentTime());
        const newValidationRecord = ValidationRecord.createValidation(aSubmission?._id, params?.types, params?.scope, VALIDATION_STATUS.VALIDATING);
        const validationRecord = await this.validationDAO.create(newValidationRecord);
        if (!validationRecord) {
            throw new Error(ERROR.FAILED_INSERT_VALIDATION_OBJECT);
        }
        const result = await this.dataRecordService.validateMetadata(params._id, params?.types, params?.scope, validationRecord.id);
        const updatedSubmission = await this._recordSubmissionValidation(params._id, validationRecord, params?.types, aSubmission);
        // roll back validation if service failed
        if (!result.success) {
            if (result.message && result.message.includes(ERROR.NO_VALIDATION_METADATA)) {
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) 
                    await this._updateValidationStatus(params?.types, updatedSubmission, null, prevFileValidationStatus, null, getCurrentTime(), validationRecord);
                else {
                    await this._updateValidationStatus(params?.types, updatedSubmission, null, "NA", null, getCurrentTime(), validationRecord);
                    result.success = true;
                }
            } 
            else if (result.message && result.message.includes(ERROR.NO_NEW_VALIDATION_METADATA)){
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE))
                    await this._updateValidationStatus(params?.types, updatedSubmission, prevMetadataValidationStatus, prevFileValidationStatus, null, prevTime, validationRecord);
                else {
                    await this._updateValidationStatus(params?.types, updatedSubmission, prevMetadataValidationStatus, "NA", null, prevTime, validationRecord);
                    result.success = true;
                }
            } else if (result.message && result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION)) {
                await this._updateValidationStatus(params?.types, updatedSubmission, null, null, prevCrossSubmissionStatus, prevTime, validationRecord);
            } else {
                const metadataValidationStatus = result.message.includes(ERROR.FAILED_VALIDATE_METADATA) ? prevMetadataValidationStatus : "NA";
                const fileValidationStatus = (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) ? prevFileValidationStatus : "NA";
                const crossSubmissionStatus = result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION) ? prevCrossSubmissionStatus : "NA";
                await this._updateValidationStatus(params?.types, updatedSubmission, metadataValidationStatus, fileValidationStatus, crossSubmissionStatus, prevTime, validationRecord);
            }
        }
        return result;
    }

    async submissionCrossValidationResults(params, context){
        verifySession(context)
            .verifyInitialized()

        const aSubmission = await this._findByID(params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const reviewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, aSubmission);
        if (reviewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION)
        }
        // Pass dataCommons for cross validation scope filtering - ticket CRDCDH-3247
        return this.dataRecordDAO.submissionCrossValidationResults(params.submissionID, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection, aSubmission?.dataCommons);
    }

    async listSubmissionNodeTypes(params, context) {
        verifySession(context)
            .verifyInitialized();

        const submissionID = params?._id;
        const aSubmission = await this._findByID(submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return this.dataRecordService.listSubmissionNodeTypes(submissionID)
    }
    /**
     * list Submission Nodes or files
     * @param {*} params 
     * @param {*} context 
     * @returns returnVal object
     */
    async listSubmissionNodes(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {
            submissionID, 
            nodeType, 
            status,
            nodeID, 
            first,
            offset,
            orderBy,
            sortDirection} = params;
        //check if submission exists
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        if(![ALL_FILTER, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.NEW, VALIDATION_STATUS.ERROR].includes(status)){
            throw new Error(ERROR.INVALID_NODE_STATUS_NOT_FOUND);
        }

        if (params?.nodeType !== DATA_FILE) {
            const query = {
                submissionID,
                nodeType,
                ...(status !== ALL_FILTER && { status }),
                ...(nodeID && { nodeID: new RegExp(nodeID, "i") })
            };

            const result = await this.dataRecordDAO.getSubmissionNodes(submissionID, nodeType,
                first, offset, orderBy, sortDirection, query);
            return this._processSubmissionNodes(result);
        }
        else {
             //1) cal s3 listObjectV2
            return await this.s3Service.listFileInDir(aSubmission.bucketName,  `${aSubmission.rootPath}/${FILE}/`)
                .then(result => 
                {
                    //process the file info and return the submission file list
                    return this._listSubmissionDataFiles(params, result);
                })
                .catch(err => {
                    console.log(err);
                    throw new Error(ERROR.FAILED_LIST_DATA_FILES)
                });
        }
        
    }
    _processSubmissionNodes(result, IDPropName=null) {
        let returnVal = {
            total: 0,
            IDPropName: IDPropName,
            properties: [],
            nodes: []
        };

        returnVal.total = result.total;
        if (result.results && result.results.length > 0){
            let propsSet = new Set();
            
            for (let node of result.results) {
                if (!returnVal.IDPropName) returnVal.IDPropName = node.IDPropName;
                if (node?.parents && node.parents.length > 0) {
                    //get unique parent.parentType from node?.parents 
                    const parentTypes = [...new Set(node.parents.map(p => p.parentType))];
                    // loop through parentTypes and get the parent.parentIDPropName, parentIDValue for each parentType
                    parentTypes.forEach((parentType) => {
                        const same_type_parents = node.parents.filter(p => p.parentType === parentType);
                        node.props[`${same_type_parents[0].parentType}.${same_type_parents[0].parentIDPropName}`] = same_type_parents.map((p) => p.parentIDValue).join(' | ')
                    });
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

    async _listSubmissionDataFiles(params, listedObjects) {
        let s3Files = [];
        let returnVal = {
            total: 0,
            properties: [],
            nodes: []
        };
        //2) populate s3Files and sorting and paging 3) retrieve file node info from dataRecords
        if (!listedObjects || listedObjects.length === 0)
            return returnVal;
        // populate s3Files list and

        const orphanedErrorFiles = await this.qcResultsService.findBySubmissionErrorCodes(params.submissionID, ERRORS.CODES.F008_MISSING_DATA_NODE_FILE);
        const orphanedErrorFileNameSet = new Set(orphanedErrorFiles
            ?.map((f) => f?.submittedID));

        for (let file of listedObjects) {
            //don't retrieve logs
            if (file.Key.endsWith('/log'))
                break
            const file_name = file.Key.split('/').pop();
            

            let s3File = {
                submissionID: params.submissionID,
                nodeType: DATA_FILE,
                nodeID: file_name,
                status: orphanedErrorFileNameSet?.has(file_name) ? VALIDATION_STATUS.ERROR : VALIDATION_STATUS.NEW,
                "Batch ID": "N/A",
                "File Name": file_name,
                "File Size": file.Size,
                Orphaned: "Y",
                "Uploaded Date/Time": file.LastModified
            };
            if(params.nodeID )
                if(!file_name.includes(params.nodeID)) continue;  //filter with params nodeID
                else {
                    s3Files.push(s3File);  
                    break;
                }
            else
                s3Files.push(s3File);  
        } 
        
        //retrieve file nodes from dataRecords
        const result = await this.dataRecordService.submissionDataFiles(params.submissionID,
             s3Files.map(f=>f.nodeID));
        
        for (let file of s3Files) {
            const node = (result && result.length > 0)? result.find(x => x.nodeID === file.nodeID) : null ;
            if (node) {
                file.status = node.status;
                file.Orphaned = "N";
            }
            const props = {
                // "Batch ID": file["Batch ID"],
                "File Name": file["File Name"],
                "File Size": file["File Size"],
                Orphaned: file.Orphaned,
                "Uploaded Date/Time": file["Uploaded Date/Time"]
            };
            file.props = JSON.stringify(props);
        }
        // filter status
        if (params.status !== "All")
            s3Files = s3Files.filter(f => f.status === params.status);

        //sorting and slicing
        s3Files.sort((a, b) => {
            if (a[params.orderBy] < b[params.orderBy])
                return (params.sortDirection === "ASC")? -1 : 1;
            if (a[params.orderBy] > b[params.orderBy])
                return (params.sortDirection === "ASC")? 1 : -1;
            return 0;
        });
        returnVal.total = s3Files.length;
        returnVal.IDPropName = "File Name";
        returnVal.nodes = (params.first > 0) ? s3Files.slice(params.offset, params.offset + params.first) : s3Files;
        returnVal.properties = ["File Name", "File Size", "Orphaned", "Uploaded Date/Time"] 
        return returnVal;
    }

    /**
     * API: getNodeDetail to retrieve node detail info
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async getNodeDetail(params, context){
        verifySession(context)
            .verifyInitialized();

        const aSubmission = await this._findByID(params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        return await this.dataRecordService.nodeDetail(params.submissionID, params.nodeType, params.nodeID);
    }
    /**
     * API: getRelatedNodes to retrieve related nodes
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async getRelatedNodes(params, context){
        verifySession(context)
            .verifyInitialized();

        const aSubmission = await this._findByID(params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        if (!NODE_RELATION_TYPES.includes(params.relationship)){
            throw new Error(ERROR.INVALID_NODE_RELATIONSHIP);
        }
        const result = await this.dataRecordService.relatedNodes(params);
        return this._processSubmissionNodes(result[0], result[1]);
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
        const aSubmission = await this.submissionDAO.findById(params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        this._verifyBatchPermission(aSubmission, context?.userInfo, viewScope);
        //set parameters
        const parameters = {submissionID: params.submissionID, apiURL: params.apiURL, 
            dataFolder: (params.dataFolder)?  params.dataFolder : "/Users/my_name/my_files",
            manifest: (params.manifest)? params.manifest: "/Users/my_name/my_manifest.tsv",
            archive_manifest: (params.archive_manifest)? params.archive_manifest: ""
        }
        //get the uploader CLI config template as string
        var configString = this.uploaderCLIConfigs;
        //insert params values into the string
        configString = configString.format(parameters);
        //insert data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        //insert token into the string
        configString = await this._replaceToken(context, configString);
        /** test code: write yaml string to file for verification of output **/
        // write2file(configString, "logs/userUploaderConfig.yaml")
        /** end test code **/
        return configString;
    }

    /**
     * API: getDataFileConfigs for submitter to upload data file from CLI
     * @param {*} params
     * @param {*} context
     * @returns data file config Object
     */
    async getDataFileConfigs(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await this.submissionDAO.findById(params.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        this._verifyBatchPermission(aSubmission, context?.userInfo, viewScope);

        // data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        const fileConfig = this._getModelFileNodeInfo(aSubmission, latestDataModel);
        const uploadingHeartbeatConfig = await this.configurationService.findByType(UPLOADING_HEARTBEAT_CONFIG_TYPE);
        return {id_field: fileConfig["id-field"],
            name_field: fileConfig["name-field"],
            size_field: fileConfig["size-field"],
            md5_field: fileConfig["md5-field"],
            omit_DCF_prefix: fileConfig["omit-DCF-prefix"],
            heartbeat_interval: uploadingHeartbeatConfig?.interval || 300
        };
    };

    /**
     * API: editSubmissionCollaborators
     * @param {*} params 
     * @param {*} context 
     * @returns submission document
     */
    async editSubmissionCollaborators(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {
            submissionID,
            collaborators, 
        } = params;
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        if (![NEW, IN_PROGRESS, SUBMITTED, RELEASED, ARCHIVED, REJECTED, WITHDRAWN].includes(aSubmission?.status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_STATUS_EDIT_COLLABORATOR, `'${aSubmission?.status}'`));
        }

        if (!aSubmission.studyID) {
            throw new Error(ERROR.INVALID_SUBMISSION_STUDY);
        }
        if (!aSubmission.collaborators) 
            aSubmission.collaborators = [];

        if (aSubmission.submitterID !== context?.userInfo?._id) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        // validate collaborators one by one.
        const accessKeys = Object.values(COLLABORATOR_PERMISSIONS);
        for (const collaborator of collaborators) {

            if (!accessKeys?.includes(collaborator?.permission)) {
                throw new Error(replaceErrorString(ERROR.INVALID_ACCESS_EDIT_COLLABORATOR, `'${collaborator?.permission}'`));
            }

            //find a submitter with the collaborator ID
            const user = await this.userDAO.findFirst({id: collaborator.collaboratorID});
            //find if the submission including existing collaborator
            if (!aSubmission.collaborators.find(c => c.collaboratorID === collaborator.collaboratorID)) {
                if (!user) {
                    throw new Error(ERROR.COLLABORATOR_NOT_EXIST);
                }
                if (user.role !== ROLES.SUBMITTER) {
                    throw new Error(ERROR.INVALID_COLLABORATOR_ROLE_SUBMITTER);
                }
                //check if user has the study the submission.
                if (!this._verifyStudyInUserStudies(user, aSubmission.studyID))
                    throw new Error(ERROR.INVALID_COLLABORATOR_STUDY);
                // validate collaborator permission
                if (!Object.values(COLLABORATOR_PERMISSIONS).includes(collaborator.permission)) {
                    throw new Error(ERROR.INVALID_COLLABORATOR_PERMISSION);
                }
            }
            collaborator.collaboratorName = user.lastName + ", " + user.firstName;
        }
        const result = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({collaborators}));
        if (result) {
            return getDataCommonsDisplayNamesForSubmission(result);
        }
        throw new Error(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
    }

    _verifyStudyInUserStudies(user, studyId){
        if(!user?.studies || user.studies.length === 0 )
            return false;
        const userStudy = (user.studies[0] instanceof Object)? user.studies.find(s => {
                const id = s.id || s._id;
                return id === studyId || id === "All";
            }) :
            user.studies.find(s=> s === studyId || s === "All"); //backward compatible
        return Boolean(userStudy);
    }

    _getModelFileNodeInfo(aSubmission, dataModelInfo){
        const modelFileNodeInfos = Object.values(dataModelInfo?.[aSubmission.dataCommons]?.[DATA_MODEL_SEMANTICS]?.[DATA_MODEL_FILE_NODES]);
        const omit_DCF_prefix = dataModelInfo?.[aSubmission.dataCommons]?.['omit-DCF-prefix'];
        if (modelFileNodeInfos.length > 0) {
            let modelFileNodeInfo = modelFileNodeInfos[0];
            modelFileNodeInfo['omit-DCF-prefix'] = (!omit_DCF_prefix) ? false : omit_DCF_prefix;
            return modelFileNodeInfo;
        }
        else {
            throw new Error(ERROR.INVALID_DATA_MODEL);
        }
    }

    async _replaceToken(context, configString){
        //check user's token
        const tokens = context.userInfo?.tokens;
        if (tokens && tokens.length > 0 && verifyToken(tokens[tokens.length-1], config.token_secret)) {
            return configString.format({token: tokens[tokens.length-1]})
        }
        const tokenDict = await this.userService.grantToken(null, context);
        if (!tokenDict || !tokenDict.tokens || tokenDict.tokens.length === 0){
            throw new Error(ERROR.INVALID_TOKEN_EMPTY);
        }
        return configString.format({token: tokenDict.tokens[0]})
    }

    async _getExistingDataFiles(fileNames, aSubmission, deleteAll = false, exclusiveIDs = []) {
        // When deleteAll is true and no exclusiveIDs, skip file checking (all files will be deleted via directory operation)
        if (deleteAll && exclusiveIDs.length === 0) {
            return new Map();
        }
        
        // When deleteAll is true with exclusiveIDs, fileNames is already filtered by the caller
        let filesToCheck = fileNames;
        
        // If no files to check, return empty Map
        if (filesToCheck.length === 0) {
            return new Map();
        }
        
        // Create a Map for lookup: S3 key path -> fileName
        const s3KeyToFileNameMap = new Map(
            filesToCheck.map(fileName => [`${aSubmission.rootPath}/${FILE}/${fileName}`, fileName])
        );
        
        const filePromises = filesToCheck
            .map(fileName =>
                this.s3Service.listFile(aSubmission.bucketName, `${aSubmission.rootPath}/${FILE}/${fileName}`)
            );
        const fileResults = await Promise.all(filePromises);
        const existingFiles = new Map();
        fileResults.forEach((file) => {
            const aFileContent = (file?.Contents)?.pop();
            const fileName = s3KeyToFileNameMap.get(aFileContent?.Key);
            if (fileName) {
                // store file name and path {file name: aws storage path}
                existingFiles.set(fileName, aFileContent?.Key);
            }
        });
        return existingFiles;
    }

    async _getAllSubmissionDataFiles(bucketName, rootPath) {
        const AllDataFiles = await this.s3Service.listFileInDir(bucketName, `${rootPath}/${FILE}/`);
        return AllDataFiles
            ?.filter((f) => f.Key !== `${rootPath}/${FILE}/`)
            ?.map((f)=> f.Key.replace(`${rootPath}/${FILE}/`, ''));
    }

    async _deleteDataFiles(existingFiles, aSubmission, deleteAll = false, exclusiveIDs = []) {
        // Set a flag when initiating the deletion of S3 files.
        await this.submissionDAO.update(aSubmission._id, this._prepareUpdateData({deletingData: true}));
        
        let fileKeysToDelete = [];
        let deletedCount = 0;
        let notDeletedErrorFiles = [];
        
        try {
            if (deleteAll && exclusiveIDs.length === 0) {
                // Get actual file count before deletion (requires extra S3 call)
                const allDataFiles = await this.s3Service.listFileInDir(aSubmission?.bucketName, `${aSubmission.rootPath}/${FILE}/`);
                deletedCount = allDataFiles?.filter((f) => f.Key !== `${aSubmission.rootPath}/${FILE}/`).length || 0;
                // Use directory deletion for deleteAll without exclusives
                await this.s3Service.deleteDirectory(aSubmission?.bucketName, `${aSubmission.rootPath}/${FILE}/`);
            } else if (deleteAll && exclusiveIDs.length > 0) {
                // Use existingFiles Map which already contains only files to delete (non-exclusive files)
                // existingFiles Map structure: Map<fileName, s3KeyPath>
                const fileNames = Array.from(existingFiles.keys());
                const s3KeyPaths = Array.from(existingFiles.values());
                
                // Process deletions in batches to avoid memory issues
                const BATCH_SIZE = 1000;
                for (let i = 0; i < s3KeyPaths.length; i += BATCH_SIZE) {
                    const batchPaths = s3KeyPaths.slice(i, i + BATCH_SIZE);
                    const batchFileNames = fileNames.slice(i, i + BATCH_SIZE);
                    const promises = batchPaths.map(fileKey => this.s3Service.deleteFile(aSubmission?.bucketName, fileKey));
                    const res = await Promise.allSettled(promises);
                    
                    res.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            const fileName = batchFileNames[index];
                            console.error(`Failed to delete; submission ID: ${aSubmission?._id} file name: ${fileName} error: ${result?.reason}`);
                            notDeletedErrorFiles.push(fileName);
                        } else if (result.status === 'fulfilled') {
                            deletedCount++;
                        }
                    });
                }
            } else {
                // Normal deletion path (existing logic)
                const existingFilesArr = Array.from(existingFiles.values());
                const promises = existingFilesArr.map(fileKey => this.s3Service.deleteFile(aSubmission?.bucketName, fileKey));
                const res = await Promise.allSettled(promises);
                const deletedFiles = [];

                res.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        const fileKey = Array.from(existingFiles.values())[index];
                        console.error(`Failed to delete; submission ID: ${aSubmission?._id} file name: ${fileKey} error: ${result?.reason}`);
                        const fileName = Array.from(existingFiles.keys())[index];
                        notDeletedErrorFiles.push(fileName);
                    }
                    // AWS API does not return the name of the deleted file.
                    if (result.status === 'fulfilled' && existingFilesArr[index]) {
                        const pathFileName = existingFilesArr[index];
                        const fileName = pathFileName.substring(existingFilesArr[index].lastIndexOf('/') + 1);
                        deletedFiles.push(fileName);
                    }
                });
                
                deletedCount = deletedFiles.length;
                fileKeysToDelete = deletedFiles;
            }

            // remove the deleted s3 file in the submission's file error
            const errors = aSubmission?.fileErrors?.filter((fileError) => {
                if (deleteAll && exclusiveIDs.length === 0) {
                    // All files deleted, remove all errors
                    return false;
                } else if (deleteAll && exclusiveIDs.length > 0) {
                    // For deleteAll with exclusives, keep errors only for excluded files
                    const exclusiveSet = new Set(exclusiveIDs);
                    return exclusiveSet.has(fileError?.submittedID) || notDeletedErrorFiles.includes(fileError.submittedID);
                } else {
                    // Normal deletion: keep errors for files that weren't deleted or failed to delete
                    const deletedFile = existingFiles.get(fileError?.submittedID);
                    return notDeletedErrorFiles.includes(fileError.submittedID) || !deletedFile;
                }
            }) || [];
            // Update fileErrors (deletingData flag will be reset in finally block)
            await this.submissionDAO.update(aSubmission._id, this._prepareUpdateData({fileErrors : errors}));
        } catch (error) {
            // Log error and ensure deletingData flag is reset in finally block
            console.error(`Failed to delete files; submission ID: ${aSubmission?._id} error: ${error}`);
            throw error;
        } finally {
            // Always reset deletingData flag, even if an error occurred
            try {
                await this.submissionDAO.update(aSubmission._id, this._prepareUpdateData({deletingData: false}));
            } catch (updateError) {
                // Log error but don't throw - we've already handled the main error
                // This prevents leaving the submission in a "deleting" state if the reset update fails
                console.error(`Failed to reset deletingData flag; submission ID: ${aSubmission?._id} error: ${updateError}`);
            }
        }
        
        // Return summary for deleteAll, or array for normal deletion
        if (deleteAll && exclusiveIDs.length === 0) {
            return { deleteAll: true, count: deletedCount };
        } else if (deleteAll && exclusiveIDs.length > 0) {
            return { deleteAll: true, count: deletedCount, excludedCount: exclusiveIDs.length };
        } else {
            return fileKeysToDelete;
        }
    }

    /**
     * archiveCompletedSubmissions
     * description: overnight job to set completed submission after retention with "archived = true", archive related data and delete s3 files
     */
    async archiveSubmissions(){
        try {
            const archiveSubs = await this.submissionDAO.getToBeArchivedSubmissions(this.emailParams.completedSubmissionDays);
            if (!archiveSubs || archiveSubs.length === 0) {
                console.debug("No completed submissions need to be archived.")
                return "No completed submissions need to be archived";
            }
           
            let failedDeleteSubs = []
            //archive related data and delete files in s3
            for (const sub of archiveSubs) {
                try {
                    await this._archiveSubmission(sub._id, sub.bucketName, sub.rootPath);
                    console.debug(`Successfully archive completed submissions: ${sub._id}.`);
                } catch (e) {
                    console.error(`Failed to delete files under archived completed submission: ${sub._id} with error: ${e.message}.`);
                    failedDeleteSubs.push(sub._id);
                }
            }
            return (failedDeleteSubs.length === 0 )? "successful!" : `Failed to delete files archived completed submission submissions: ${failedDeleteSubs.toString()}.  please contact admin.`;
        }
        catch (e){
            console.error("Failed to archive completed submission(s) with error:" + e.message);
            return "failed!";
        }
    }

    async _archiveSubmission(submissionID, bucketName, rootPath) {
        const result = await this.s3Service.deleteDirectory(bucketName, rootPath);
        if (result === true) {
            await this.dataRecordService.archiveMetadataByFilter({"submissionID": submissionID});
            await this.batchDAO.deleteBatchesBySubmissionID(submissionID);
            await this.submissionDAO.update(submissionID, this._prepareUpdateData({"archived": true}, new Date()));
        } else {
            console.error(`Failed to delete files in the s3 bucket. SubmissionID: ${submissionID}.`);
        }
    }

     /**
     * deleteInactiveSubmissions
     * description: overnight job to set inactive submission status to "Deleted", delete related data and files
     */
     async deleteInactiveSubmissions(){
        try {
            const inactiveSubs = await this.submissionDAO.getToBeDeletedSubmissions(this.emailParams.inactiveSubmissionDays);
            if (!inactiveSubs || inactiveSubs.length === 0) {
                console.debug("No inactive submission found.")
                return "No inactive submissions";
            }
            let failedDeleteSubs = []
            const deletedSubmissions = [];
            //delete related data and files
            for (const sub of inactiveSubs) {
                try {
                    const result = await this.s3Service.deleteDirectory(sub.bucketName, sub.rootPath);
                    if (result === true) {
                        await this.dataRecordService.deleteMetadataByFilter({"submissionID": sub._id});
                        await this.batchDAO.deleteBatchesBySubmissionID(sub._id);
                        await this.submissionDAO.update(sub._id, this._prepareUpdateData({"status" : DELETED}, new Date()));
                        deletedSubmissions.push(sub);
                        console.debug(`Successfully deleted inactive submissions: ${sub._id}.`);
                    }
                } catch (e) {
                    console.error(`Failed to delete files under inactive submission: ${sub._id} with error: ${e.message}.`);
                    failedDeleteSubs.push(sub._id);
                }
            }

            await Promise.all(deletedSubmissions.map(async (aSubmission) => {
                await this._sendEmailsDeletedSubmissions(aSubmission);
            }));
            return (failedDeleteSubs.length === 0 )? "successful!" : `Failed to delete files under submissions: ${failedDeleteSubs.toString()}.  please contact admin.`;
        }
        catch (e){
            console.error("Failed to delete inactive submission(s) with error:" + e.message);
            return "failed!";
        }
    }

    async _remindPrimaryContactEmail(aSubmission, approvedStudy, aProgram) {
        const [dcpUsers, CCUsers] = await Promise.all([
            this.userService.findUsersByNotificationsAndRole(
                [EN.DATA_SUBMISSION.CREATE],
                [USER.ROLES.DATA_COMMONS_PERSONNEL],
                aSubmission?.dataCommons
            ),
            (async () => {
                const users = await this.userService.findUsersByNotificationsAndRole(
                    [EN.DATA_SUBMISSION.CREATE],
                    [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD]
                );
                return users?.filter(({ role, studies }) => (
                    role === USER.ROLES.ADMIN ||
                    (role === USER.ROLES.FEDERAL_LEAD &&
                        (validateStudyAccess(studies, approvedStudy?.id)))
                ));
            })(),
        ]);

        if (dcpUsers?.length > 0) {
            const primaryContactName = aSubmission?.conciergeName?.trim();
            const studyCombinedName = approvedStudy?.studyAbbreviation?.trim().length > 0 ? `${approvedStudy?.studyAbbreviation} - ${approvedStudy?.studyName || NA}` : approvedStudy?.studyName;
            const studyFullName = approvedStudy?.studyName === approvedStudy?.studyAbbreviation ? approvedStudy?.studyName : studyCombinedName;
            await this.notificationService.remindNoPrimaryContact(getUserEmails(dcpUsers), getUserEmails(CCUsers), {
                dataCommonName: aSubmission?.dataCommonsDisplayName,
                submissionName: `${aSubmission?.name}`,
                studyFullName: studyFullName || NA,
                programName: aProgram?.name || NA,
                primaryContactName: primaryContactName?.length > 0 ? primaryContactName : this._NOT_ASSIGNED
            });
        }
    }

    async _sendEmailsDeletedSubmissions(aSubmission) {
         const [aSubmitter, BCCUsers, approvedStudy] = await Promise.all([
            this.userService.getUserByID(aSubmission?.submitterID),
            this.userService.getUsersByNotifications([EN.DATA_SUBMISSION.DELETE],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            this.approvedStudyDAO.findFirst({ id: aSubmission?.studyID })
         ]);
         if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Delete", `id=${aSubmission?._id}`);
            return;
         }

         if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.DELETE)) {
             const filteredBCCUsers = BCCUsers.filter((u) =>
                 u?._id !== aSubmitter?._id &&
                 isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
             await this.notificationService.deleteSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                 firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`}, {
                 submissionName: `${aSubmission?.name},`,
                 studyName: approvedStudy?.studyName || NA,
                 inactiveDays: this.emailParams.inactiveSubmissionDays,
                 contactName: `${aSubmission?.conciergeName || 'NA'}`,
                 contactEmail: `${aSubmission?.conciergeEmail || 'NA'}.`
             });
             logDaysDifference(this.emailParams.inactiveSubmissionDays + " Deleted Action", aSubmission?.accessedAt, aSubmission?._id);
         }
    }

    /**
     * purgeDeletedDataFiles
     * remove deleted data files in "to-be-deleted" after tagged with "Completed = true"
     */
    async purgeDeletedDataFiles(){
        //get target purge date, current date - config.purgeDeletedDataFileDays (default 180 days)
        const purgeConfig = await this.configurationService.findByType("PURGE_DELETED_DATA_FILE");
        const purgeDays = purgeConfig?.days ?? 180;
        const folder = purgeConfig?.prefix ?? "to_be_deleted";
        const tag = purgeConfig?.tag ?? {Key: "Completed", Value: "true"};
        const dmBucketConfig = await this.configurationService.findByType("DM_BUCKET_NAME");
        const dmBucketName = dmBucketConfig?.keys.dm_bucket;
        try {

            await this.s3Service.purgeDeletedFiles(dmBucketName, folder, purgeDays, tag);
            console.debug(`Successfully purged deleted data files in ${dmBucketName}.`); 
        }
        catch (e){
            console.error(`Failed to purge deleted data files in ${dmBucketName} with error: ${e.message}`);
        }
    }
    async deleteDataRecords(params, context) {
        // verify user is logged in and initialized
        verifySession(context)
            .verifyInitialized();
        
        // fetch the submission and verify it exists
        const aSubmission = await this._findByID(params.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        // verify submission is not released
        if (aSubmission.status === RELEASED) {
            throw new Error(ERROR.INVALID_DELETE_SUBMISSION_STATUS);
        }

        // verify permission to delete data records
        const dataSubmissionCreateScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        let permission = false;
        // submitter with own permission
        permission = permission || (dataSubmissionCreateScope.isOwnScope() && aSubmission?.submitterID === context?.userInfo?._id);
        // collaborator with any create scope (other than none) and study access
        permission = permission || (this._isCollaborator(context?.userInfo, aSubmission) && !dataSubmissionCreateScope.isNoneScope() && validateStudyAccess(context?.userInfo?.studies, aSubmission?.studyID));
        // has study permission
        permission = permission || (dataSubmissionCreateScope.isStudyScope() && validateStudyAccess(context?.userInfo?.studies, aSubmission?.studyID));
        // has data commons permission
        permission = permission || (dataSubmissionCreateScope.isDCScope() && validateDataCommonsAccess(context?.userInfo?.dataCommons, aSubmission?.dataCommons));
        // has all permission
        permission = permission || dataSubmissionCreateScope.isAllScope();
        // if no permission, throw error
        if (!permission) {
            throw new Error(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION);
        }

        // create parameter variables
        const nodeIDs = params.nodeIDs || [];
        const exclusiveIDs = params.exclusiveIDs || [];
        const deleteAll = params.deleteAll || false;

        // validate arrays are within the limits
        if (nodeIDs.length > 2000 || exclusiveIDs.length > 2000) {
            throw new Error(ERROR.INVALID_DELETE_DATA_RECORDS_ARRAY_LENGTH);
        }

        // if node type is data file 
        if (params?.nodeType === VALIDATION.TYPES.DATA_FILE) {
            let existingFiles;
            let deletedResult;
            let nodeIDsForLogging;
            
            if (deleteAll) {
                // Delete QC results
                await this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, [], deleteAll, exclusiveIDs);
                
                // skip file existence check if there are no exclusives
                if (exclusiveIDs.length === 0) {
                    // Delete entire directory
                    deletedResult = await this._deleteDataFiles(new Map(), aSubmission, deleteAll, exclusiveIDs);
                    nodeIDsForLogging = 'deleteAll';
                } 
                else {
                    // get all files and filter out exclusives
                    const allFiles = await this._getAllSubmissionDataFiles(aSubmission?.bucketName, aSubmission?.rootPath) || [];
                    const exclusiveSet = new Set(exclusiveIDs);
                    const filesToDelete = allFiles.filter(fileName => !exclusiveSet.has(fileName));
                    
                    // if no files to delete, throw error
                    if (filesToDelete.length === 0) {
                        return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
                    }
                    
                    // query existing files in filesToDelete list
                    existingFiles = await this._getExistingDataFiles(filesToDelete, aSubmission, deleteAll, exclusiveIDs);
                    
                    // if no existing files, throw error
                    if (existingFiles.size === 0) {
                        return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
                    }
                    
                    // delete data files
                    deletedResult = await this._deleteDataFiles(existingFiles, aSubmission, deleteAll, exclusiveIDs);
                    nodeIDsForLogging = exclusiveIDs.length > 0 ? `deleteAll excluding ${exclusiveIDs.length} nodes` : 'deleteAll';
                }
            } 
            else {
                // delete data files by nodeIDs
                // query existing data files
                existingFiles = await this._getExistingDataFiles(nodeIDs, aSubmission, false, []);
                // filter out files that do not exist in the s3 bucket
                const notExistingFileNames = nodeIDs.filter(item => !existingFiles.has(item));
                // delete QC results for files that do not exist in the s3 bucket (not existing in the s3 bucket)
                await this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, notExistingFileNames, false, []);
                // if no existing files, throw error
                if (existingFiles.size === 0) {
                    return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
                }
                // delete data files by nodeIDs
                deletedResult = await this._deleteDataFiles(existingFiles, aSubmission, false, []);
                nodeIDsForLogging = deletedResult;
            }
            
            // if deleted files, update submission data file info
            // deletedCount is always a number: positive count or 0
            const deletedCount = typeof deletedResult === 'object' && deletedResult.deleteAll 
                ? deletedResult.count
                : (Array.isArray(deletedResult) ? deletedResult.length : 0);
            
            const hasDeletedFiles = deletedCount > 0;
            if (hasDeletedFiles) {
                // query submission data files (only if not deleteAll without exclusives, to avoid loading all files)
                const promises = [];
                if (deleteAll && exclusiveIDs.length === 0) {
                    // For deleteAll without exclusives, directory is empty, so skip file listing
                    promises.push(Promise.resolve([]));
                } else {
                    promises.push(this._getAllSubmissionDataFiles(aSubmission?.bucketName, aSubmission?.rootPath));
                }
                promises.push(this._getS3DirectorySize(aSubmission?.bucketName, `${aSubmission?.rootPath}/${FILE}/`));
                
                // Delete QC results for deleted files (only if not already done in deleteAll path)
                if (deleteAll) {
                    // QC results already deleted in deleteAll path above, skip
                    promises.push(Promise.resolve());
                } else {
                    // Normal deletion: delete QC results for deleted files
                    const filesToDeleteQC = Array.isArray(deletedResult) ? deletedResult : [];
                    promises.push(this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, filesToDeleteQC, false, []));
                }
                
                // log data record
                promises.push(this._logDataRecord(context?.userInfo, aSubmission._id, VALIDATION.TYPES.DATA_FILE, nodeIDsForLogging));
                
                // Await all promises to ensure errors are properly caught and handled
                // Note: qcDeletionResult and logResult are available but not used
                const [submissionDataFiles, dataFileSize, qcDeletionResult, logResult] = await Promise.all(promises);
                
                // reset fileValidationStatus if the number of data files changed. No data files exists if null
                const fileValidationStatus = submissionDataFiles?.length > 0 ? VALIDATION_STATUS.NEW : null;
                // update submission data file info
                const res = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({
                    fileValidationStatus,
                    dataFileSize
                }));
                // if failed to update submission data file info, throw error
                if (!res) {
                    console.error(`failed to update submission data file info; submissionID: ${aSubmission?._id}`);
                }
            }
            
            // return success message
            if (deleteAll && exclusiveIDs.length === 0) {
                return ValidationHandler.success(`${deletedCount} nodes deleted`);
            } else if (deleteAll && exclusiveIDs.length > 0) {
                const count = typeof deletedResult === 'object' && deletedResult.count ? deletedResult.count : 0;
                return ValidationHandler.success(`${count} nodes deleted (excluding ${exclusiveIDs.length} nodes)`);
            } else {
                const count = Array.isArray(deletedResult) ? deletedResult.length : 0;
                return ValidationHandler.success(`${count} nodes deleted`);
            }
        }

        // if node type is not data file
        // create SQS message
        const msg = {
            type: DELETE_METADATA, 
            submissionID: params.submissionID, 
            nodeType: params.nodeType, 
            deleteAll: deleteAll,
            nodeIDs: deleteAll ? [] : nodeIDs,
            exclusiveIDs: deleteAll ? exclusiveIDs : []
        };
        // request delete data records
        const success = await this._requestDeleteDataRecords(msg, this.sqsLoaderQueue, params.submissionID, params.submissionID);
        // update submission deleting data info
        const updated = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({deletingData: isTrue(success?.success)}));
        // if failed to update submission deleting data info, throw error
        if (!updated) {
            console.error(ERROR.FAILED_UPDATE_DELETE_STATUS, aSubmission?._id);
            throw new Error(ERROR.FAILED_UPDATE_DELETE_STATUS);
        }

        // if successful, log data record
        if (isTrue(success?.success)) {
            // Use summary message for deleteAll, full array for normal deletion
            const nodeIDsForLogging = deleteAll 
                ? (exclusiveIDs.length > 0 ? `deleteAll excluding ${exclusiveIDs.length} nodes` : 'deleteAll')
                : nodeIDs;
            await this._logDataRecord(context?.userInfo, aSubmission._id, params.nodeType, nodeIDsForLogging);
        }
        // return success message
        return success;
    }

    async listPotentialCollaborators(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await this._findByID(params?.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        // Check if the user has permission to list potential collaborators
        if (!(await this._checkPermissionForListPotentialCollaborators(context?.userInfo, aSubmission))) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // find Collaborators with aSubmission.studyID
        let collaborators = await this.userService.getCollaboratorsByStudyID(aSubmission?.studyID, aSubmission?.submitterID);
        return collaborators.map((user) => {
           return getDataCommonsDisplayNamesForUser(user);
        });
    }

    async _checkPermissionForListPotentialCollaborators(userInfo, submission) {
        // If the userInfo or submission is not provided, return false
        if (!userInfo || !submission) {
            return false;
        }
        try{
            const reviewPermission = await this._checkDataSubmissionReviewPermission(userInfo, submission);
            if (reviewPermission) {
                return true;
            }
            else if (userInfo?._id === submission?.submitterID) {
                const userCreateScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
                // All scope, the user has permission to list potential collaborators       
                if (userCreateScope.isAllScope()) {
                    return true;
                }
                // Study scope, the user must still have study access
                const userStudies = userInfo?.studies || [];
                const hasStudyAccess = validateStudyAccess(userStudies, submission?.studyID);
                if (userCreateScope.isStudyScope() && hasStudyAccess) {
                    return true;
                }
                // DC scope, the user must still have data commons access
                const userDataCommons = userInfo?.dataCommons || [];
                const hasDataCommonsAccess = validateDataCommonsAccess(userDataCommons, submission?.dataCommons);
                if (userCreateScope.isDCScope() && hasDataCommonsAccess) {
                    return true;
                }
                // Own scope, the user must still have study access
                if (userCreateScope.isOwnScope() && hasStudyAccess) {
                    return true;
                }
            }
            return false;
        }
        catch(error){
            // log the error and throw an internal error message to be displayed to the user
            console.error(ERROR.INTERNAL_ERROR);
            console.error('Error checking permission for list potential collaborators:', error);
            throw new Error(ERROR.INTERNAL_ERROR);
        }
    }

    async _checkDataSubmissionReviewPermission(userInfo, submission) {
        if (!userInfo || !submission) {
            return false;
        }
        const userStudies = userInfo?.studies || [];
        const userDataCommons = userInfo?.dataCommons || [];
        const userReviewScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, submission);
        // All scope, the user has permission to list potential collaborators
        if (userReviewScope.isAllScope()) {
            return true;
        }
        // Study scope, the user must have study access
        if (userReviewScope.isStudyScope() && validateStudyAccess(userStudies, submission?.studyID)) {
            return true;
        }
        // DC scope, the user must have data commons access
        if (userReviewScope.isDCScope() && validateDataCommonsAccess(userDataCommons, submission?.dataCommons)) {
            return true;
        }
        return false;
    }

    async editSubmission(params, context) {
        verifySession(context)
            .verifyInitialized();

        const {_id, newName} = params;
        const userInfo = context?.userInfo;
        const aSubmission = await this._findByID(_id);

        this._validateEditSubmission(aSubmission, newName, context?.userInfo?._id);

        if (aSubmission?.name === newName?.trim()) {
            return aSubmission
        }
        // Check permission
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Check study
        if (!userScope.isAllScope()) {
            if (userScope.isOwnScope() || userScope.isStudyScope()) {
                if (!validateStudyAccess(userInfo.studies, aSubmission?.studyID)) {
                    throw new Error(ERROR.INVALID_STUDY_ACCESS)
                }
            } 
        }
        
        // Check for duplicate submission names using Prisma instead of MongoDB aggregation
        const duplicateStudySubmission = await this._checkDuplicateSubmissionName(newName?.trim(), aSubmission?.studyID, aSubmission?.id);

        if (duplicateStudySubmission) {
            throw new Error(ERROR.DUPLICATE_STUDY_SUBMISSION_NAME);
        }

        const updated = await this.submissionDAO.update(aSubmission?._id, {name: newName});
        if (!updated) {
            throw new Error(ERROR.FAILED_UPDATE_SUBMISSION_NAME);
        }

        // Log for the modifying submission name using Prisma
        if (updated) {
            await this._createUpdateSubmissionNameLog(userInfo, updated._id, aSubmission?.name, newName);
        }
        return updated;
    }

    _validateEditSubmission(aSubmission, newName, userID) {
        if (!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        if (newName?.trim().length > MAX_SUBMISSION_NAME_LENGTH) {
            throw new Error(`${ERROR.MAX_SUBMISSION_NAME_LIMIT};${newName}`);
        }

        if (!newName || newName?.trim()?.length === 0) {
            throw new Error(`${ERROR.EMPTY_SUBMISSION_NAME}`);
        }

        // Only primary submitter can modify the submission name
        if (userID !== aSubmission?.submitterID) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
    }

    /**
     * API: update the submission info.
     * @param {*} params
     * @param {*} context
     * @returns {Promise<Submission>}
     */
    async updateSubmissionInfo(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {_id, version, submitterID} = params;
        const aSubmission = await this._findByID(_id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const [userReviewPermissionScope, validVersions, { prevSubmitter, newSubmitter }] = await Promise.all([
            this.authorizationService.getPermissionScope(context.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW),
            (async () => {
                const dataModels = await this.fetchDataModelInfo();
                return this._getAllModelVersions(dataModels, aSubmission?.dataCommons);
            })(),
            (async () => {
                if (submitterID) {
                    const newSubmitter = await this.userDAO.findFirst({id: submitterID});
                    const preSubmitter = await this.userDAO.findFirst({id: aSubmission?.submitterID});
                    return {prevSubmitter: preSubmitter, newSubmitter: newSubmitter};
                }
                return {};
            })()
        ]);
        const userReviewPermissionNone = userReviewPermissionScope.some(item => item?.scope === PERMISSION_SCOPES.NONE && item?.scopeValues?.length === 0);
        const userReviewPermissionAll = userReviewPermissionScope.some(item => item?.scope === PERMISSION_SCOPES.ALL || item === PERMISSION_SCOPES.ALL);
        const userReviewPermissionDC = userReviewPermissionScope.some(item => item?.scope === PERMISSION_SCOPES.DC);
        const userReviewPermissionStudy = userReviewPermissionScope.some(item => item?.scope === PERMISSION_SCOPES.STUDY);
        if (userReviewPermissionNone) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        if (version) {
            if (!validVersions.includes(version)) {
                throw new Error(replaceErrorString(ERROR.INVALID_MODEL_VERSION, `${version || " "}`));
            }
        }

        if (![IN_PROGRESS, NEW, WITHDRAWN, REJECTED].includes(aSubmission?.status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_STATUS_MODEL_VERSION, `${aSubmission?.status}`));
        }

        if (submitterID && submitterID !== aSubmission.submitterID) {
            if (!newSubmitter) {
                throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_NO_SUBMITTER, submitterID));
            }
            if (newSubmitter?.userStatus === USER.STATUSES.INACTIVE) {
                throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_INVALID_SUBMITTER, submitterID));
            }
            // submitter must have data_submission:create permission
            const userCreatePermissionScope = await this.authorizationService.getPermissionScope(newSubmitter, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
            const userCreatePermissionNone = userCreatePermissionScope.some(item => item?.scope === PERMISSION_SCOPES.NONE && item?.scopeValues?.length === 0);
            if (userCreatePermissionNone) {
                throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_INVALID_SUBMITTER, submitterID));
            }
            // submitter must have the correct study access
            if (!validateStudyAccess(newSubmitter.studies, aSubmission?.studyID)) {
                throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_INVALID_SUBMITTER_STUDY, submitterID));
            }
        }
        const userInfo = context.userInfo;
        let isPermitted = false;
        if (userReviewPermissionAll) {
            isPermitted = true;
        }
        if (userReviewPermissionDC) {
            isPermitted = userInfo.dataCommons?.includes(aSubmission?.dataCommons);
        }
        if (userReviewPermissionStudy) {
            isPermitted = validateStudyAccess(userInfo.studies, aSubmission?.studyID)
        }
        if (!isPermitted) {
            throw new Error(ERROR.INVALID_MODEL_VERSION_PERMISSION);
        }
        // If no change, return the submission
        if (aSubmission?.modelVersion === version && (submitterID === undefined || aSubmission?.submitterID === submitterID)) {
            return aSubmission;
        }
        if (aSubmission?.submitterID === submitterID && version === undefined ) {
            return aSubmission;
        }

        const updatedSubmission = await this.submissionDAO.update(
            aSubmission?._id, {
                ...(version ? { modelVersion: version} : {}),
                ...(submitterID ? { submitterID: submitterID} : {}),
                updatedAt: getCurrentTime()
            }
        );

        if (!updatedSubmission) {
            const msg = ERROR.FAILED_UPDATE_SUBMISSION + `; submissionID: ${aSubmission?._id}`;
            console.error(msg)
            throw new Error(msg);
        }

        await this._notifyConfigurationChange(aSubmission, version, prevSubmitter, newSubmitter);

        // Log for the modifying submission
        if (updatedSubmission) {
            await this.logCollection.insert(UpdateSubmissionConfEvent.create(
                userInfo._id, userInfo.email, userInfo.IDP, updatedSubmission._id,
                // model change
                aSubmission?.modelVersion, updatedSubmission?.modelVersion,
                // submitter change
                prevSubmitter?._id, newSubmitter?._id));
            // add submitter name to the return object
            if (submitterID && submitterID !== aSubmission.submitterID) {
                updatedSubmission.submitterName = newSubmitter?.fullName;
            }
            else {
                updatedSubmission.submitterName = aSubmission.submitterName;
            }
        }
        // only when changing model will reset validation
        if (version !== undefined && aSubmission?.modelVersion !== version) {
            await this._resetValidation(aSubmission);
        }
        return updatedSubmission;
    }

    /**
     * Notifies users about configuration changes to a submission.
     * Sends email notifications to the new submitter, CCs the previous submitter (if changed),
     * and BCCs relevant administrators and data commons personnel.
     * 
     * @param {Object} aSubmission - The submission object containing submission details (required)
     * @param {string|null} newModelVersion - The new model version for the submission (can be null)
     * @param {Object} prevSubmitter - The previous submitter object (assumed to be valid, not null/undefined)
     * @param {Object} newSubmitter - The new submitter object (assumed to be valid, not null/undefined)
     * @throws {Error} If aSubmission, newSubmitter, or prevSubmitter are null/undefined
     */
    async _notifyConfigurationChange(aSubmission, newModelVersion, prevSubmitter, newSubmitter) {
        // Validate required parameters
        if (!aSubmission) {
            console.error(`${ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE}; aSubmission parameter is required and cannot be null or undefined`);
            throw new Error(ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE);
        }
        if (!newSubmitter) {
            console.error(`${ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE}; newSubmitter parameter is required and cannot be null or undefined`);
            throw new Error(ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE);
        }
        if (!prevSubmitter) {
            console.error(`${ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE}; prevSubmitter parameter is required and cannot be null or undefined`);
            throw new Error(ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE);
        }
        const isSubmitterChanged = Boolean(newSubmitter && prevSubmitter?.id !== newSubmitter?.id);
        // Check if the submitter has the required notification enabled
        if (!newSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.CHANGE_CONFIGURATION)) {
            console.warn(`Submission updated; submitter does not have configuration change notifications enabled. submissionID: ${aSubmission?.id}, submitterID: ${newSubmitter?.id}`);
            return;
        }
        // Initialize recipient variables
        const submitterEmails = [newSubmitter?.email];
        let CCEmails = [];
        let BCCEmails = [];
        // If there's a new submitter, check if the old submitter should be CC'd
        if (isSubmitterChanged && prevSubmitter?.id) {
            const prevSubmitterUser = await this.userDAO.findByIdAndStatus(prevSubmitter.id, USER.STATUSES.ACTIVE);
            if (prevSubmitterUser?.email && 
                prevSubmitterUser.notifications?.includes(EN.DATA_SUBMISSION.CHANGE_CONFIGURATION)){
                CCEmails = [prevSubmitterUser.email];
            }
        }
        // Lookup admins, federal leads, and data commons personnel with notification enabled to intialize BCC list
        const otherUsers = await this.userDAO.getUsersByNotifications(
            [EN.DATA_SUBMISSION.CHANGE_CONFIGURATION],
            [USER.ROLES.DATA_COMMONS_PERSONNEL, USER.ROLES.FEDERAL_LEAD, USER.ROLES.ADMIN]
        );
        const submissionDataCommons = aSubmission?.dataCommons;
        const submissionStudyID = aSubmission?.studyID;
        // filter the BCC list
        BCCEmails = otherUsers.reduce((acc, u) => {
            if (!u?.email) return acc;
            if (u.role === USER.ROLES.DATA_COMMONS_PERSONNEL) {
                // Data Commons Personnel: filter by matching data commons
                if (validateDataCommonsAccess(u.dataCommons, submissionDataCommons)) {
                    acc.push(u.email);
                }
            }
            else if (u.role === USER.ROLES.FEDERAL_LEAD) {
                // Federal Lead: filter by matching study or study "ALL"
                if (validateStudyAccess(u.studies, submissionStudyID)) {
                    acc.push(u.email);
                }
            }
            else if (u.role === USER.ROLES.ADMIN) {
                // Admin: no filtering required
                acc.push(u.email);
            }
            return acc;
        }, []);
        
        if (submitterEmails?.length > 0) {
            const isVersionChanged = newModelVersion != null && newModelVersion !== aSubmission.modelVersion;
            const sent = await this.notificationService.updateSubmissionNotification(submitterEmails, CCEmails, BCCEmails, {
                firstName: getEmailUserName(newSubmitter),
                portalURL: this.emailParams.url || NA,
                studyName: aSubmission?.study?.studyName || NA,
                // Changing the model version
                ...(isVersionChanged ? {prevModelVersion: aSubmission?.modelVersion || NA} : {}),
                ...(isVersionChanged ? {newModelVersion: newModelVersion || NA} : {}),
                // Changing the submitter
                ...(isSubmitterChanged && prevSubmitter ? { prevSubmitterName: getEmailUserName(prevSubmitter) || NA } : {}),
                ...(isSubmitterChanged ? { newSubmitterName: getEmailUserName(newSubmitter) || NA } : {})
            });

            if (sent?.accepted?.length === 0) {
                console.error(`${ERROR.FAILED_NOTIFY_SUBMISSION_UPDATE};submissionID ${aSubmission?.id}`);
            }
        }

        if (submitterEmails?.length === 0) {
            console.log(`Submission updated; email notification to submitter not sent. submissionID: ${aSubmission?.id}`);
        }
    }

    async _resetValidation(aSubmission) {
        const aSubmissionID = aSubmission?._id;
        const aSubmissionFileValidationStatus = aSubmission?.fileValidationStatus;
        let fileValidationStatusValue = null;
        let validationStatusList = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        if (validationStatusList.includes(aSubmissionFileValidationStatus)){
            fileValidationStatusValue = VALIDATION_STATUS.NEW;
        }
        const [resetSubmission, resetDataRecords, resetQCResult] = await Promise.all([
            this.submissionDAO.update(
                aSubmissionID, { // update condition
                    // Update documents
                    updatedAt: getCurrentTime(),
                    metadataValidationStatus: VALIDATION_STATUS.NEW,
                    fileValidationStatus: fileValidationStatusValue,
                    crossSubmissionStatus: VALIDATION_STATUS.NEW}
            ),
            this.dataRecordService.resetDataRecords(aSubmissionID, VALIDATION_STATUS.NEW),
            this.qcResultsService.resetQCResultData(aSubmissionID)
        ]);

        if (!resetSubmission) {
            const errorMsg = `${ERROR.FAILED_RESET_SUBMISSION}; SubmissionID: ${aSubmissionID}`;
            console.error(errorMsg)
            throw new Error(errorMsg);
        }

        if (!resetDataRecords?.acknowledged) {
            const errorMsg = `${ERROR.FAILED_RESET_DATA_RECORDS}; SubmissionID: ${aSubmissionID}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        if (!resetQCResult) {
            const errorMsg = `${ERROR.FAILED_RESET_QC_RESULT}; SubmissionID: ${aSubmissionID}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * API: get releases data
     * @param {*} params 
     * @param {*} context 
     * @returns {Promise<Object>}
     */
    async getReleasedNodeByIDs(params, context) {
        verifySession(context)
            .verifyInitialized();

        const {
            submissionID,
            nodeType,
            nodeID,
            status
        } = params; // all three parameters are required in GraphQL API
        const submission = await this._findByID(submissionID);
        if (!submission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, submission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        // the results is array of nodes, [new, release]
        const results = await this.dataRecordService.getReleasedAndNewNode(
            submissionID,
            submission.dataCommons,
            nodeType,
            nodeID,
            status
        );

        return (results?.length === 2)
            ? results.map(getDataCommonsDisplayNamesForReleasedNode)
            : null;
    }

    async verifyTempCredential(submissionID, userInfo) {
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        if(!aSubmission.rootPath)
            throw new Error(`${ERROR.VERIFY.EMPTY_ROOT_PATH}, ${submissionID}!`);

        const isCollaborator = this._isCollaborator(userInfo, aSubmission)
        const userScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        if (userScope.isNoneScope() && !isCollaborator) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return aSubmission;
    }

    async _logDataRecord(userInfo, submissionID, nodeType, nodeIDs) {
        try {
            const userName = `${userInfo?.lastName ? userInfo?.lastName + ',' : ''} ${userInfo?.firstName || NA}`;
            // Handle both arrays and summary strings (for deleteAll operations)
            const logNodeIDs = Array.isArray(nodeIDs) ? nodeIDs : (typeof nodeIDs === 'string' ? [nodeIDs] : []);
            const logEvent = DeleteRecordEvent.create(userInfo._id, userInfo.email, userName, submissionID, nodeType, logNodeIDs);
            
            // Create log entry using Prisma
            const logData = {
                userID: logEvent.userID,
                userEmail: logEvent.userEmail,
                userIDP: logEvent.userIDP,
                userName: logEvent.userName,
                eventType: logEvent.eventType,
                submissionID: logEvent.eventDetail?.submissionID,
                timestamp: Date.now() / 1000,
                localtime: new Date()
            };
            
            const createdLog = await prisma.log.create({
                data: logData
            });
            return createdLog;
        } catch (error) {
            console.error('Error creating log entry:', error);
            // Don't throw error for logging failures as it shouldn't break the main flow
            return null;
        }
    }

    async _requestDeleteDataRecords(message, queueName, deDuplicationId, submissionID) {
        try {
            await this.awsService.sendSQSMessage(message, deDuplicationId, deDuplicationId, queueName);
            return ValidationHandler.success();
        } catch (e) {
            console.error(ERRORS.FAILED_REQUEST_DELETE_RECORDS, `submissionID:${submissionID}`, `queue-name:${queueName}`, `error:${e}`);
            return ValidationHandler.handle(`queue-name: ${queueName}. ` + e);
        }
    }

    // private function
    async _updateValidationStatus(types, aSubmission, metaStatus, fileStatus, crossSubmissionStatus, updatedTime, validationRecord = null) {
        const typesToUpdate = {};
        // Cross validation status now only applies to submissions with same study AND data commons
        // Ticket CRDCDH-3247
        if (crossSubmissionStatus && crossSubmissionStatus !== "NA" && types.includes(VALIDATION.TYPES.CROSS_SUBMISSION)) {
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

        const updated = await this.submissionDAO.update(aSubmission?._id, this._prepareUpdateData({...typesToUpdate, validationEnded: getCurrentTime()}, false))
        if (validationRecord) {
            validationRecord["ended"] = new Date();
            validationRecord["status"] = "Error";
            await this.validationDAO.update(validationRecord["id"], validationRecord)
        }
        if (!updated) {
            throw new Error(ERROR.FAILED_VALIDATE_METADATA);
        }
    }

    // Get all data-model version from the given url.
    _getAllModelVersions(dataModels, dataCommonType) {
        return dataModels?.[dataCommonType]?.["versions"] || [];
    }


    _getModelVersion(dataModelInfo, dataCommonType) {
        const modelVersion = dataModelInfo?.[dataCommonType]?.["current-version"];
        if (modelVersion) {
            return modelVersion;
        }
        throw new Error(ERROR.INVALID_DATA_MODEL_VERSION);
    }

    async _recordSubmissionValidation(submissionID, validationRecord, dataTypes, submission) {
        // The file/metadata only allowed for recording validation
        const metadataTypes = validationRecord.type?.filter((i) => i === VALIDATION.TYPES.METADATA || i === VALIDATION.TYPES.FILE);
        if (metadataTypes.length === 0) {
            return submission;
        }
        const dataValidation = DataValidation.createDataValidation(metadataTypes, validationRecord.scope, validationRecord.started);
        const updated = await this.submissionDAO.update(submissionID,
            this._prepareUpdateData({
                ...dataValidation
            }));

        if (!updated) {
            throw new Error(ERROR.FAILED_RECORD_VALIDATION_PROPERTY);
        }

        return updated;
    }

    // Generates a query for the status of all email notification reminder.
    _getEveryReminderQuery(remindSubmissionDay, status) {
        return remindSubmissionDay.reduce((acc, day) => {
            acc[`${INACTIVE_REMINDER}_${day}`] = status;
            return acc;
        }, {[`${FINAL_INACTIVE_REMINDER}`]: status});
    }

    _isCollaborator(userInfo, aSubmission) {
        const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
        return collaboratorUserIDs.includes(userInfo?._id);
    }

    /**
     * API: getMetadataFile
     * @param {*} params
     * @param {*} context
     * @returns string
     */
    async getMetadataFile(params, context) {
        verifySession(context)
            .verifyInitialized();

        const {
            batchID: batchID,
            fileName: fileName
        } = params;
        // verify batchID and batch status
        const aBatch = await this.batchService.findByID(batchID);
        if (!aBatch) {
            throw new Error(ERROR.BATCH_NOT_EXIST);
        }
        if (aBatch?.status === BATCH.STATUSES.FAILED) {
            throw new Error(ERROR.BATCH_NOT_UPLOADED);
        }
        const aSubmission = await this._findByID(aBatch?.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        try{
            return await this.batchService.getMetadataFile(aSubmission, aBatch, fileName);
        }
        catch (e) {
            throw new Error(ERROR.FAILED_GET_METADATA_FILE);
        }
    }

    /**
     * API: getSubmissionAttributes; Return the validation attribute to check if the data submission can be submitted.
     * @param {*} params
     * @param {*} context
     * @returns Object {SubmissionAttributes, isValidationPassed, isAdminSubmit}
     */
    async getSubmissionAttributes(params, context) {
        verifySession(context)
            .verifyInitialized();

        let aSubmission = await this._findByID(params?.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }

        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const [adminSubmitUserScope, dataFileSize, orphanedErrorFiles, uploadingBatches] = await Promise.all([
            this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.ADMIN_SUBMIT, aSubmission),
            this._getS3DirectorySize(aSubmission?.bucketName, `${aSubmission?.rootPath}/${FILE}/`),
            this.qcResultsService.findBySubmissionErrorCodes(params.submissionID, ERRORS.CODES.F008_MISSING_DATA_NODE_FILE),
            this.batchService.findOneBatchByStatus(params.submissionID, BATCH.STATUSES.UPLOADING)
        ]);

        const submissionAttributes = SubmissionAttributes.create(!adminSubmitUserScope.isNoneScope(), aSubmission, dataFileSize?.size, orphanedErrorFiles?.length > 0, uploadingBatches.length > 0);
        return {
            submissionAttributes: submissionAttributes,
            isValidationPassed: !submissionAttributes.isValidationNotPassed(),
        }
    }

    _verifyBatchPermission(aSubmission, userInfo, userScope) {
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        // Only for Data Submission Owner / Collaborators
        const hasStudies = this._verifyStudyInUserStudies(userInfo, aSubmission?.studyID);
        const isCollaborator = this._isCollaborator({_id: userInfo?._id}, aSubmission);
        // Only owned or collaborator
        const hasValidBatchPermission = (isCollaborator && hasStudies) || (userInfo?._id === aSubmission?.submitterID && hasStudies);
        if ((userScope.isStudyScope() && !hasValidBatchPermission)) {
            throw new Error(ERROR.INVALID_BATCH_PERMISSION);
        }
    }

    async _getUserScope(userInfo, aPermission, aSubmission = null) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, aPermission);
        const userScope = UserScope.create(validScopes);
        const isRoleScope = userScope.isRoleScope();
        const isOwnScope = userScope.isOwnScope();

        const isStudyScope = userScope.isStudyScope();
        const isDCScope = userScope.isDCScope();

        const isValidUserScope = userScope.isNoneScope() || isOwnScope || userScope.isAllScope() ||
            isRoleScope || isStudyScope || isDCScope;
        if (!isValidUserScope) {
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }

    async getPendingPVs(params, context) {
        verifySession(context)
            .verifyInitialized();

        const {submissionID} = params;
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        const isCollaborator = this._isCollaborator(context?.userInfo, aSubmission) && viewScope.isStudyScope() && viewScope.hasStudyValue(aSubmission?.studyID);
        const isNotPermitted = !isCollaborator && viewScope.isNoneScope();
        if (isNotPermitted) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return await this.pendingPVDAO.findBySubmissionID(submissionID)
    }

    async requestPV(param, context) {
        verifySession(context)
            .verifyInitialized();
        const {submissionID, property, value, nodeName, comment} = param;
        if (nodeName?.trim()?.length === 0) {
            throw new Error(ERROR.EMPTY_NODE_REQUEST_PV);
        }

        if (comment?.trim().length > MAX_COMMENT_LENGTH) {
            throw new Error(ERROR.COMMENT_LIMIT);
        }

        if (property?.trim()?.length === 0) {
            throw new Error(ERROR.EMPTY_PROPERTY_REQUEST_PV);
        }

        if (value?.length === 0) {
            throw new Error(ERROR.EMPTY_PV_REQUEST_PV);
        }

        const aSubmission = await this._findByID(param.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const [isNotPermitted, { DCEmails, nonDCEmails }, cdeID, pendingPVs] = await Promise.all([
            (async () => {
                const createScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
                return !this._isCollaborator(context?.userInfo, aSubmission) && createScope.isNoneScope();
            })(),
            (async () => {
                const DCUsers = await this.userService.getUsersByNotifications([EN.DATA_SUBMISSION.PENDING_PV],
                    [ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN, ROLES.FEDERAL_LEAD]);
                return (DCUsers || []).reduce(
                    (acc, u) => {
                        if (u?.email) {
                            if (u.role === ROLES.DATA_COMMONS_PERSONNEL && u?.dataCommons?.includes(aSubmission?.dataCommons)) {
                                acc.DCEmails.push(u.email);
                            }

                            if (u.role === ROLES.FEDERAL_LEAD && this._verifyStudyInUserStudies(u, aSubmission?.studyID)) {
                                acc.nonDCEmails.push(u.email);
                            }

                            if (u.role === ROLES.ADMIN) {
                                acc.nonDCEmails.push(u.email);
                            }
                        }
                        return acc;
                    },
                    { DCEmails: [], nonDCEmails: [] }
                );
            })(),
            (async () => {
                const modelInfo = await this.dataModelService.getDataModelByDataCommonAndVersion(aSubmission?.dataCommons, aSubmission?.modelVersion);
                const termPropertyArr = modelInfo.props_?.[property]?.terms();
                return termPropertyArr?.length > 0 ? termPropertyArr[0]?.origin_id?.trim() : null;
            })(),
            this.pendingPVDAO.findBySubmissionID(submissionID),
        ]);

        if (isNotPermitted) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        if (DCEmails.length === 0) {
            console.error(ERROR.NO_RECIPIENT_PV_REQUEST);
            return ValidationHandler.handle(ERROR.NO_RECIPIENT_PV_REQUEST);
        }

        const filteredPendingPVs = pendingPVs?.filter(pv => pv?.value === value && pv?.offendingProperty === property);
        if (filteredPendingPVs?.length > 0) {
            throw new Error(replaceErrorString(ERROR.DUPLICATE_REQUEST_PV, `submissionID: ${submissionID}, property: ${property}, value: ${value}`));
        }

        const insertedPendingPV = await this.pendingPVDAO.insertOne(submissionID, property, value);
        if (!insertedPendingPV) {
            throw new Error(replaceErrorString(ERROR.FAILED_TO_INSERT_REQUEST_PV, `submissionID: ${submissionID}, property: ${property}, value: ${value}`));
        }

        const userInfo = context?.userInfo;
        const res = await this.notificationService.requestPVNotification(DCEmails, nonDCEmails, aSubmission?.dataCommonsDisplayName ,{
            submitterName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
            submitterEmail: userInfo?.email,
            studyName: aSubmission?.studyName,
            nodeName: nodeName,
            studyAbbreviation: aSubmission?.studyAbbreviation,
            submissionID: aSubmission?._id,
            CDEId: cdeID || "NA",
            property : property?.trim(),
            value : sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }),
            comment: comment?.trim()
        });

        if (res?.accepted?.length > 0) {
            return ValidationHandler.success()
        }
        const error = replaceErrorString(ERROR.FAILED_TO_REQUEST_PV, `userID:${context?.userInfo?._id}`);
        console.error(error);
        return ValidationHandler.handle(error);
    }
     async downloadDBGaPLoadSheet(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {
            submissionID: submissionID
        } = params;
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // generate DD and DS files
        const dataCommon = aSubmission.dataCommons.toUpperCase();
        let zipDir = null;
        let zipFile = null;
        try {
            switch(dataCommon){
                case "CDS":
                    zipDir = await this.dataRecordService.createDBGaPLoadSheetForCDS(aSubmission);
                    break;
                default:
                    throw new Error(ERROR.NOT_SUPPORTED_DATA_COMMONS_FOR_LOAD_SHEET);
            }
            if (!zipDir && !fs.existsSync(zipDir)) {
                throw new Error(ERROR.FAILED_CREATE_LOAD_SHEET);
            }
            zipFile = zipDir + ".zip";
            const result = await zipFilesInDir(zipDir, zipFile);
            if (!result || !fs.existsSync(zipFile)) {
                throw new Error(ERROR.FAILED_CREATE_LOAD_SHEET);
            }
            const zipFileName = path.basename(zipFile);
            // upload the zip file into s3 and create pre-signed download link
            await this.s3Service.uploadZipFile(aSubmission.bucketName, aSubmission.rootPath, zipFileName, zipFile);
            return await this.s3Service.createDownloadSignedURL(aSubmission.bucketName, aSubmission.rootPath, zipFileName);
        }
        catch (e) {
            console.error(e);
            throw e;
        }
        finally {
            if (zipFile && fs.existsSync(zipFile)) {
                const downloadDir = path.dirname(zipFile);
                if (downloadDir && fs.existsSync(downloadDir)) {
                    try {
                        fs.rmSync(downloadDir, {recursive: true, force: true });
                    } catch (error) {
                        console.error("Error during cleanup:", error);
                    }
                }
            }
        }
    }
    /**
     * Get submission summary
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async getSubmissionSummary(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {
            submissionID
        } = params;
        const aSubmission = await this._findByID(submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        // Generate summary
        return await this.dataRecordService.retrieveDSSummary(aSubmission);
    }

    async _findByID(id) {
        try {
            // Use a single Prisma query with includes to fetch submission and related data
            const aSubmission = await this.submissionDAO.findFirst(
                { id },
                {
                    include: { 
                        study: {
                            select: {
                                id: true,
                                studyName: true,
                                studyAbbreviation: true
                            }
                        },
                        submitter: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                fullName: true,
                                email: true
                            }
                        },
                        concierge: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                fullName: true,
                                email: true
                            }
                        },
                    }
                }
            );

            if (!aSubmission) {
                return null;
            }

            // Fetch organization data if programID exists
            if (aSubmission?.programID) {
                const org = await this.programDAO.findFirst(
                    {id: aSubmission.programID},
                    {
                        orderBy: {name: PRISMA_SORT.DESC},
                        take: 1,
                        select: {
                            id: true,
                            name: true,
                            abbreviation: true,
                        }
                    }
                );
                
                // Transform organization to match GraphQL schema (map id to _id)
                aSubmission.organization = formatNestedOrganization(org);
            }

            // Transform study data to match expected format
            if (aSubmission?.study?.id) {
                aSubmission.study._id = aSubmission.study.id;
                // note: FE use the root level properties; studyName, studyAbbreviation
                aSubmission.studyName = aSubmission.study.studyName;
                aSubmission.studyAbbreviation = aSubmission.study.studyAbbreviation;
            }

            // Transform submitter data to match expected format
            if (aSubmission?.submitter?.id && aSubmission?.submitter?.firstName) {
                // note: FE use the root level properties; submitterName
                aSubmission.submitterName = aSubmission?.submitter?.fullName || "";
            }

            if (aSubmission?.concierge?.id) {
                // note: FE use the root level properties; conciergeName, conciergeEmail
                aSubmission.conciergeName = aSubmission?.concierge?.fullName || "";
                aSubmission.conciergeEmail = aSubmission?.concierge?.email || aSubmission.conciergeEmail;
            }
            return aSubmission;
        } catch (error) {
            console.error('Error in _findByID:', error);
            throw new Error(`Failed to find submission by ID: ${error.message}`);
        }
    }

    /**
     * Create a log entry using Prisma
     * @param {Object} logData - The log data to create
     * @returns {Promise<Object>} The created log entry
     */
    async _createLogEntry(logData) {
        try {
            const createdLog = await prisma.log.create({
                data: logData
            });
            return createdLog;
        } catch (error) {
            console.error('Error creating log entry:', error);
            // Don't throw error for logging failures as it shouldn't break the main flow
            return null;
        }
    }

    async _checkDuplicateSubmissionName(newName, studyID, submissionID) {
        return await this.submissionDAO.findFirst({
            name: newName,
            studyID: studyID,
            NOT: {
                id: submissionID
            }
        });
    }

    async _createUpdateSubmissionNameLog(userInfo, submissionID, oldName, newName) {
        try {
            const logEvent = UpdateSubmissionNameEvent.create(
                userInfo._id, userInfo.email, userInfo.IDP, submissionID, oldName, newName
            );
            
            // Create log entry using Prisma
            const logData = {
                userID: logEvent.userID,
                userEmail: logEvent.userEmail,
                userIDP: logEvent.userIDP,
                userName: logEvent.userName,
                eventType: logEvent.eventType,
                submissionID: logEvent.submissionID,
                timestamp: Date.now() / 1000,
                localtime: new Date()
            };
            
            const createdLog = await prisma.log.create({
                data: logData
            });
            return createdLog;
        } catch (error) {
            console.error('Error creating update submission name log entry:', error);
            // Don't throw error for logging failures as it shouldn't break the main flow
            return null;
        }
    }
}

const updateSubmissionStatus = async (submissionDAO, aSubmission, userInfo, newStatus) => {
    const newHistory = HistoryEventBuilder.createEvent(userInfo?._id, newStatus, null);
    aSubmission.history = [...(aSubmission.history || []), newHistory];
    const updated = await submissionDAO.update(aSubmission._id, {status: newStatus, history: aSubmission.history, updatedAt: getCurrentTime()});
    if (!updated) {
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
 * @param {*} emailParams
 * @param {*} dataCommonsBucketMap
 */
async function submissionActionNotification(userInfo, action, aSubmission, userService, organizationService, notificationService, emailParams, dataCommonsBucketMap) {
    switch(action) {
        case ACTIONS.SUBMIT:
            await sendEmails.submitSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.RELEASE:
            await sendEmails.releaseSubmission(emailParams, userInfo, aSubmission, userService, dataCommonsBucketMap, notificationService);
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
        case ACTIONS.ARCHIVE:
            //todo TBD send archived email
            break;
        default:
            console.error(ERROR.NO_SUBMISSION_RECEIVER+ `id=${aSubmission?._id}`);
            break;
    }
}

const sendEmails = {
    submitSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.SUBMIT],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN])
        ]);

        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Submit", `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.SUBMIT)) {
            const filteredBCCUsers = BCCUsers.filter((u) =>
                u?._id !== aSubmitter?._id &&
                isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
            await notificationService.submitDataSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                    firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
                }, {
                    submissionName: `${aSubmission?.name},`,
                    dataCommonsName: aSubmission?.dataCommonsDisplayName,
                    contactName: `${aSubmission?.conciergeName || 'NA'}`,
                    contactEmail: `${aSubmission?.conciergeEmail || 'NA'}.`
                }
            );
        }
    },
    completeSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers, aOrganization, approvedStudy] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.COMPLETE],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            organizationService.getOrganizationByID(aSubmission?.organization?._id),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);

        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Complete", `id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) => isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.COMPLETE)) {
            await notificationsService.completeSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                submissionName: `${aSubmission?.name},`,
                // only one study
                studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
                conciergeName: aSubmission?.conciergeName || NA,
                conciergeEmail: `${aSubmission?.conciergeEmail || NA}.`
            });
        }
    },
    cancelSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers, aOrganization, approvedStudy] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.CANCEL],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            organizationService.getOrganizationByID(aSubmission?.organization?._id),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);

        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Cancel", `id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) =>
            u?._id !== aSubmitter?._id &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.CANCEL)) {
            await notificationService.cancelSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                submissionID: aSubmission?._id,
                submissionName: aSubmission?.name,
                studyName: approvedStudy?.length > 0 ? approvedStudy[0]?.studyName : NA,
                canceledBy: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
                conciergeEmail: `${aSubmission?.conciergeEmail || NA}.`,
                conciergeName: aSubmission?.conciergeName || NA
            });
        }
    },
    withdrawSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [DCPRoleUsers, BCCUsers, approvedStudy] = await Promise.all([
            userService.getDCPs(aSubmission?.dataCommons),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.WITHDRAW],
                [ROLES.FEDERAL_LEAD, ROLES.SUBMITTER, ROLES.ADMIN]),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);
        const filteredDCPUsers = DCPRoleUsers.filter((u) =>
            u?.notifications?.includes(EN.DATA_SUBMISSION.WITHDRAW) &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));

        if (filteredDCPUsers.length === 0) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Withdraw" ,`id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) => isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        await notificationsService.withdrawSubmissionNotification(getUserEmails(filteredDCPUsers), getUserEmails(filteredBCCUsers), {
            firstName: `${aSubmission?.dataCommons} Data Commons Personnel`
        }, {
            submissionID: aSubmission?._id,
            submissionName: aSubmission?.name,
            // only one study
            studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
            withdrawnByName: `${userInfo.firstName} ${userInfo?.lastName || ''}.`,
            withdrawnByEmail: `${userInfo?.email}`
        });
    },
    releaseSubmission: async (emailParams, userInfo, aSubmission, userService, dataCommonsBucketMap, notificationsService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [DCPRoleUsers, BCCUsers, approvedStudy] = await Promise.all([
            userService.getDCPs(aSubmission?.dataCommons),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.RELEASE],
                [ROLES.FEDERAL_LEAD, ROLES.SUBMITTER, ROLES.ADMIN]),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);
        const filteredDCPUsers = DCPRoleUsers.filter((u) =>
            u?.notifications?.includes(EN.DATA_SUBMISSION.RELEASE) &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));

        if (filteredDCPUsers.length === 0) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Release", `id=${aSubmission?._id}`);
            return;
        }

        const dataCommonBucket = dataCommonsBucketMap?.has(aSubmission?.dataCommons) ?
            dataCommonsBucketMap.get(aSubmission?.dataCommons) : "NA";

        const additionalInfo = [
            [SUBMISSION_ID, aSubmission?._id],
            [DATA_SUBMISSION_TYPE, aSubmission?.intention],
            [DESTINATION_LOCATION, `${dataCommonBucket}`]];

        const filteredBCCUsers = BCCUsers.filter((u) => isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        await notificationsService.releaseDataSubmissionNotification(getUserEmails(filteredDCPUsers), getUserEmails(filteredBCCUsers), {
            firstName: `${aSubmission?.dataCommonsDisplayName} team`,
            additionalInfo: additionalInfo}, {
            dataCommonName: aSubmission?.dataCommonsDisplayName}, {
            submissionName: aSubmission?.name,
            // only one study
            studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
            techSupportEmail: `${emailParams.techSupportEmail || NA}.`
        })
    },
    rejectSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers, aOrganization] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.REJECT],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            organizationService.getOrganizationByID(aSubmission?.organization?._id)
        ]);

        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Reject", `id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) =>
            u?._id !== aSubmitter?._id &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REJECT)) {
            await notificationService.rejectSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                submissionID: aSubmission?._id,
                submissionName: aSubmission?.name,
                conciergeEmail: `${aSubmission?.conciergeEmail || NA}.`,
                conciergeName: aSubmission?.conciergeName || NA
            });
        }
    },
    remindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService, expiredDays, pastDays) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers, approvedStudy] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.REMIND_EXPIRE],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);

        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Inactive Submission Reminder", `id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) =>
            u?._id !== aSubmitter?._id &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REMIND_EXPIRE)) {
            await notificationService.inactiveSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                title: aSubmission?.name,
                expiredDays: expiredDays || NA,
                studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
                pastDays: pastDays || NA,
                url: emailParams.url || NA
            });
            logDaysDifference(pastDays, aSubmission?.accessedAt, aSubmission?._id);
        }
    },
    finalRemindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService) => {
        aSubmission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const [aSubmitter, BCCUsers, approvedStudy] = await Promise.all([
            userService.getUserByID(aSubmission?.submitterID),
            userService.getUsersByNotifications([EN.DATA_SUBMISSION.REMIND_EXPIRE],
                [ROLES.FEDERAL_LEAD, ROLES.DATA_COMMONS_PERSONNEL, ROLES.ADMIN]),
            userService.approvedStudiesCollection.find(aSubmission?.studyID)
        ]);
        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, "Final Reminder", `id=${aSubmission?._id}`);
            return;
        }

        const filteredBCCUsers = BCCUsers.filter((u) =>
            u?._id !== aSubmitter?._id &&
            isUserScope(u?._id, u?.role, u?.studies, u?.dataCommons, aSubmission));
        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REMIND_EXPIRE)) {
            await notificationService.finalInactiveSubmissionNotification(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                title: aSubmission?.name,
                studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
                days: emailParams.finalRemindSubmissionDay || NA,
                url: emailParams.url || NA
            });
            logDaysDifference(emailParams.finalRemindSubmissionDay, aSubmission?.accessedAt, aSubmission?._id);
        }
    }
}

const isUserScope = (userID, userRole, userStudies, userDataCommons, aSubmission) => {
    if (!aSubmission)
        return false;
    switch (userRole) {
        case ROLES.ADMIN:
            return true; // Admin has access to all data submissions.
        case ROLES.FEDERAL_LEAD:
            const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
            return isAllStudy(studies) ? true : studies.find(study =>
                study._id === aSubmission.studyID
            );
        case ROLES.DATA_COMMONS_PERSONNEL:
            return userDataCommons.includes(aSubmission.dataCommons); // Access to assigned data commons.
        case ROLES.SUBMITTER:
            return aSubmission.submitterID === userID // Access to own submissions.
        default:
            return false; // No access for other roles.
    }
}


/**
 * Determines if a user has valid access to a submission based on their scope.
 *
 * Validates the following scope types:
 * - all: User has access to all submissions.
 * - own: User has access to their own submissions.
 * - study: User has access to submissions for assigned studies.
 * - dataCommons: User has access to submissions for assigned data commons.
 *
 * @param {string} userID - The ID of the user.
 * @param {Object} userScope - The scope object with methods to check scope type.
 * @param {Array<Object>} userStudies - Array of study objects assigned to the user.
 * @param {Array<string>} userDataCommons - Array of data commons IDs assigned to the user.
 * @param {Object} aSubmission - The submission object to check access for.
 * @returns {boolean} True if the user has valid access to the submission, false otherwise.
 */
const userHasValidScope = (userID, userScope, userStudies, userDataCommons, aSubmission) => {
    if (!aSubmission)
        return false;

    if (userScope.isAllScope()) {
        return true; // Admin has access to all data submissions.
    } else if (userScope.isOwnScope()) {
        return aSubmission.submitterID === userID // Access to own submissions.
    } else if (userScope.isStudyScope()) {
        const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
        return isAllStudy(studies) || Boolean(studies.find(study => study._id === aSubmission.studyID));
    } else if (userScope.isDCScope()) {
        return userDataCommons.includes(aSubmission.dataCommons); // Access to assigned data commons.
    }
    return false;
}

function validateStudyAccess (userStudies, submissionStudy) {
    const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
    return Boolean(isAllStudy(studies) || studies.find(study => study._id === submissionStudy) || studies.find(study => study.id === submissionStudy));
}

const getUserEmails = (users) => {
    return users
        ?.filter((aUser) => aUser?.email)
        ?.map((aUser)=> aUser.email);
}

function validateCreateSubmissionParams (params, allowedDataCommons, hiddenDataCommons, intention, dataType) {
    if (!params.name || params?.name?.trim().length === 0 || !params.studyID || !params.dataCommons) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_PARAMS);
    }
    if (params?.name?.length > CONSTRAINTS.NAME_MAX_LENGTH) {
        throw new Error(replaceErrorString(ERROR.CREATE_SUBMISSION_INVALID_NAME, `${CONSTRAINTS.NAME_MAX_LENGTH}`));
    }
    if (hiddenDataCommons.has(params.dataCommons) || !allowedDataCommons.has(params.dataCommons)) {
        throw new Error(replaceErrorString(ERROR.CREATE_SUBMISSION_INVALID_DATA_COMMONS, `'${params.dataCommons}'`));
    }
    if (!intention) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_INTENTION);
    }
    if (!dataType) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_DATA_TYPE);
    }
    if (intention === INTENTION.DELETE && dataType !== DATA_TYPE.METADATA_ONLY) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_DELETE_INTENTION);
    }
}

class ValidationRecord {
    // submissionID: string
    // type: array
    // scope: array
    // started: Date
    // status: string
    constructor(submissionID, type, scope, status) {
        this.submissionID = submissionID;
        this.type = type;
        this.scope = scope;
        this.started = getCurrentTime();
        this.status = status;
    }
    static createValidation(submissionID, validationType, validationScope, status) {
        return new ValidationRecord(submissionID, validationType, validationScope, status);
    }
}


class DataValidation {
    // validationType: string
    // validationScope: string
    // validationStarted: Date
    constructor(validationType, validationScope, validationStarted) {
        this.validationStarted = validationStarted ? validationStarted : getCurrentTime();
        this.validationEnded = null;
        this.validationType = validationType?.map(type => type.toLowerCase());
        this.validationScope = validationScope?.toLowerCase();
    }
    static createDataValidation(validationType, validationScope, validationStarted) {
        return new DataValidation(validationType, validationScope, validationStarted);
    }
}
const SUBMISSIONS = "submissions";
class DataSubmission {
    constructor(name, userInfo, dataCommons, dbGaPID, aProgram, modelVersion, intention, dataType, approvedStudy, submissionBucketName) {
        this.name = name;
        this.submitterID = userInfo._id;
        this.collaborators = [];
        this.dataCommons = dataCommons;
        this.modelVersion = modelVersion;
        this.studyID = approvedStudy?._id;
        this.dbGaPID = dbGaPID;
        this.status = NEW;
        this.history = [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)];
        if (aProgram && aProgram?._id) {
            this.programID = aProgram?._id;
        }
        this.bucketName = submissionBucketName;
        this.rootPath = "";
        this.conciergeID = this._getConciergeID(approvedStudy, aProgram);
        this.createdAt = this.updatedAt = getCurrentTime();
        // no metadata to be validated
        this.metadataValidationStatus = this.fileValidationStatus = this.crossSubmissionStatus = null;
        this.fileErrors = [];
        this.fileWarnings = [];
        this.intention = intention;
        this.dataType = dataType;
        if (!isUndefined(approvedStudy?.controlledAccess)) {
            this.controlledAccess = approvedStudy.controlledAccess;
        }
        this.ORCID = approvedStudy?.ORCID || null;
        this.accessedAt = getCurrentTime();
        this.dataFileSize = FileSize.createFileSize(0);
        this.inactiveReminder_7 = false;
        this.inactiveReminder_30 = false;
        this.inactiveReminder_60 = false;
        this.finalInactiveReminder = false;
    }

    static createSubmission(name, userInfo, dataCommons, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName) {
        return new DataSubmission(name, userInfo, dataCommons, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName);
    }

    _getConciergeID(approvedStudy, aProgram){
        if (approvedStudy?.primaryContact) {
            return approvedStudy.primaryContact?._id || approvedStudy.primaryContact?.id;
        } else if (aProgram) {
            return aProgram?.conciergeID;
        } else {
            return null;
        }
    }
}

class FileSize {
    constructor(size = 0) {
        this.formatted = fileSizeFormatter(size);
        this.size = size;
    }

    static createFileSize(size) {
        return new FileSize(size);
    }
}

class Collaborators {
    constructor(collaborators) {
        this.collaborators = collaborators || [];
    }

    static createCollaborators(collaborators) {
        return new Collaborators(collaborators)
    }

    getCollaboratorIDs() {
        return this.collaborators
            .map(i => i?.collaboratorID) || [];
    }

    getCollaboratorNames() {
        return this.collaborators
            .map(i => i?.collaboratorName) || [];
    }

    getEditableCollaboratorIDs() {
        return this._getEditableCollaborators(this.collaborators)
            .map(i => i?.collaboratorID) || [];
    }

    _getEditableCollaborators(collaborators) {
        return collaborators
            .filter(i => i?.permission === COLLABORATOR_PERMISSIONS.CAN_EDIT);
    }
}

class SubmissionAttributes {
    _validationStatuses = [VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING];
    constructor(isAdminAction, aSubmission, dataFileSize, hasOrphanFile, isBatchUploading) {
        this.isSubmissionStatusNew = aSubmission?.status === NEW;
        // 1. The metadataValidationStatus and fileValidationStatus should not be Validating.
        this.isValidating = (aSubmission?.dataType === DATA_TYPE.METADATA_ONLY && aSubmission.metadataValidationStatus === VALIDATION_STATUS.VALIDATING) ||
            (aSubmission?.dataType === DATA_TYPE.METADATA_AND_DATA_FILES && aSubmission.fileValidationStatus === VALIDATION_STATUS.VALIDATING);
        this.isBatchUploading = isBatchUploading;
        this.isValidSubmissionStatus = [IN_PROGRESS, WITHDRAWN, REJECTED]?.includes(aSubmission?.status);
        // Admin can skip the requirement; The metadataValidationStatus and fileValidationStatus should not be Error.

        this.isMetadataValidationError = aSubmission?.metadataValidationStatus === VALIDATION_STATUS.ERROR;
        this.isDatafileValidationError = aSubmission?.fileValidationStatus === VALIDATION_STATUS.ERROR;
        const ignoreErrorValidation = isAdminAction && (this.isMetadataValidationError || this.isDatafileValidationError);

        this.isReadyMetadataOnly = aSubmission?.dataType === DATA_TYPE.METADATA_ONLY &&
            (ignoreErrorValidation || this._validationStatuses.includes(aSubmission?.metadataValidationStatus));
        this.isReadyMetadataDataFile = aSubmission?.dataType === DATA_TYPE.METADATA_AND_DATA_FILES &&
            (ignoreErrorValidation || (this._validationStatuses.includes(aSubmission?.metadataValidationStatus) && this._validationStatuses.includes(aSubmission?.fileValidationStatus)));

        // 2. The dataFileSize.size property should be greater than 0 for submissions with the data type Metadata and Data Files.; ignore if metadata only && delete intention
        const ignoreDataFileValidation = aSubmission?.intention === INTENTION.DELETE || aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
        this.isValidDataFileSize = ignoreDataFileValidation || (aSubmission?.dataType === DATA_TYPE.METADATA_AND_DATA_FILES && dataFileSize > 0);
        // 3. The metadataValidationStatus and fileValidationStatus should not be New
        this.isValidationNotNew = aSubmission?.metadataValidationStatus !== VALIDATION_STATUS.NEW && aSubmission?.fileValidationStatus !== VALIDATION_STATUS.NEW;
        // 4. Metadata validation should be initialized for submissions with the intention Delete.
        this.isValidDeleteIntention = aSubmission?.intention === INTENTION.UPDATE || (aSubmission?.intention === INTENTION.DELETE && this._validationStatuses.includes(aSubmission?.metadataValidationStatus));
        this.hasOrphanError = hasOrphanFile;
        this.isAdminSubmit = isAdminAction;
    }


    static create(isAdminAction, aSubmission, dataFileSize, hasOrphanFile, isBatchUploading) {
        return new SubmissionAttributes(isAdminAction, aSubmission, dataFileSize, hasOrphanFile, isBatchUploading);
    }

    isValidationNotPassed() {
        return this.isValidating || this.isBatchUploading || !this.isValidDeleteIntention || !this.isValidSubmissionStatus ||
            !(this.isReadyMetadataOnly || this.isReadyMetadataDataFile) || !this.isValidDataFileSize || this.isSubmissionStatusNew || !this.isValidationNotNew || this.hasOrphanError;
    }
}

/**
 * Formats user name for email display.
 * 
 * @param {Object} userInfo - User object containing firstName and lastName
 * @returns {string} Formatted name string, or "user" if userInfo is null/undefined or results in empty string
 * @note The fallback to "user" indicates an invalid use case that should be investigated
 */
const getEmailUserName = (userInfo) => {
    if (!userInfo) {
        console.warn('getEmailUserName: userInfo is null/undefined, falling back to "user"');
        return 'user';
    }
    const formattedName = `${userInfo.firstName || ''} ${userInfo?.lastName || ''}`.trim();
    if (!formattedName) {
        console.warn('getEmailUserName: formatted name is empty, falling back to "user"', {
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            userId: userInfo.id
        });
        return 'user';
    }
    return formattedName;
}


function logDaysDifference(inactiveDays, accessedAt, submissionID) {
    const startedDate = accessedAt; // Ensure it's a Date object
    const endDate = getCurrentTime();
    const differenceMs = endDate - startedDate; // Difference in milliseconds
    const days = Math.floor(differenceMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((differenceMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((differenceMs % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`Submission ID: ${submissionID}, Inactive Days: ${inactiveDays}, Last Accessed: ${startedDate}, Current Time: ${endDate}  Difference: ${days} days, ${hours} hours, ${minutes} minutes`);
}

module.exports = {
    Submission
};

// Potential future enhancement
function validateDataCommonsAccess(userDataCommons, submissionDataCommons) {
    const dataCommons = Array.isArray(userDataCommons) && userDataCommons.length > 0 ? userDataCommons : [];
    return Boolean(
        dataCommons.includes("All") || 
        dataCommons.includes(submissionDataCommons)
    );
}

