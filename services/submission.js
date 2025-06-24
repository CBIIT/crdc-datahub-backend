const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS, INTENTION, DATA_TYPE, DELETED, DATA_FILE,
    CONSTRAINTS, COLLABORATOR_PERMISSIONS, UPLOADING_HEARTBEAT_CONFIG_TYPE
} = require("../constants/submission-constants");
const {v4} = require('uuid')
const fs = require('fs');
const path = require('path');
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession} = require("../verifier/user-info-verifier");
const {verifySubmissionAction} = require("../verifier/submission-verifier");
const {formatName} = require("../utility/format-name");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {SubmissionActionEvent, DeleteRecordEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
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
const {getDataCommonsDisplayNamesForSubmission, getDataCommonsDisplayNamesForListSubmissions,
    getDataCommonsDisplayNamesForUser, getDataCommonsDisplayNamesForReleasedNode
} = require("../utility/data-commons-remapper");
const {UserScope} = require("../domain/user-scope");
const {ORGANIZATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const SubmissionDAO = require("../dao/submission");
const {zipFilesInDir} = require("../utility/io-util");
const FILE = "file";

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
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    _NOT_ASSIGNED = "Not yet assigned";
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService,
                dataRecordService, fetchDataModelInfo, awsService, metadataQueueName, s3Service, emailParams, dataCommonsList,
                hiddenDataCommonsList, validationCollection, sqsLoaderQueue, qcResultsService, uploaderCLIConfigs, 
                submissionBucketName, configurationService, uploadingMonitor, dataCommonsBucketMap, authorizationService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
        this.dataRecordService = dataRecordService;
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
        this.submissionDAO = new SubmissionDAO();
    }

    async createSubmission(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
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
                const programs = await this.organizationService.findOneByStudyID(params?.studyID);
                return (programs && programs.length > 0) ? programs[0] : null;
            })()
        ]);

        if (approvedStudies.length === 0) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }
        let approvedStudy = approvedStudies[0];
        if (approvedStudy.controlledAccess && !approvedStudy?.dbGaPID) {
            throw new Error(ERROR.MISSING_CREATE_SUBMISSION_DBGAPID);
        }

        if (isTrue(approvedStudy?.pendingModelChange)) {
            throw new Error(ERROR.PENDING_APPROVED_STUDY);
        }

        if (approvedStudy?.primaryContactID) {
            approvedStudy.primaryContact = await this.userService.getUserByID(approvedStudy.primaryContactID)
        }
        const newSubmission = getDataCommonsDisplayNamesForSubmission(DataSubmission.createSubmission(
            params.name, context.userInfo, params.dataCommons, approvedStudy?.dbGaPID, program, modelVersion, intention, dataType, approvedStudy, this.submissionBucketName));
        const res = await this.submissionCollection.insert(newSubmission);
        if (!(res?.acknowledged)) {
            throw new Error(ERROR.CREATE_SUBMISSION_INSERTION_ERROR);
        }

        await this._remindPrimaryContactEmail(newSubmission, approvedStudy, program);
        return newSubmission;
    }
    async _findApprovedStudies(studies) {
        if (!studies || studies.length === 0) return [];
        const studiesIDs = (studies[0] instanceof Object) ? studies.map((study) => study?._id) : studies;
        const approvedStudies = await this.userService.approvedStudiesCollection.aggregate([{
            "$match": {
                "_id": { "$in": studiesIDs } 
            }
        }]);
        return approvedStudies;
    }

    async listSubmissions(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for listSubmissions, returning empty list");
            return {submissions: [], total: 0};
        }
        validateListSubmissionsParams(params);

        const filterConditions = [
            // default filter for listing submissions
            this._listConditions(context?.userInfo, params.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
            // no filter for dataCommons aggregation
            this._listConditions(context?.userInfo, ALL_FILTER, null, null, ALL_FILTER, ALL_FILTER, userScope),
            // note: Aggregation of Submitter name should not be filtered by a submitterName
            this._listConditions(context?.userInfo, params?.status, params.name, params.dbGaPID, params.dataCommons, ALL_FILTER, userScope),
            // Organization filter condition before joining an approved-studies collection
            this._listConditions(context?.userInfo, params?.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
            // note: Aggregation of status name should not be filtered by statuses
            this._listConditions(context?.userInfo, ALL_FILTER, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
        ]

        const [listConditions, dataCommonsCondition, submitterNameCondition, organizationCondition, statusCondition] = filterConditions;
        const pipeline = [{"$match": listConditions}, {
            $addFields: {
                dataFileSize: {
                    $cond: {
                        if: { $in: ["$status", [DELETED, CANCELED]] },
                        then: { size: 0, formatted: NA },
                        else: "$dataFileSize"
                    }
                }
            }},
            {
                $lookup: {
                    from: ORGANIZATION_COLLECTION,
                    let: { studyId: "$studyID" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    "$and": [
                                        {"$in": ["$$studyId", "$studies._id"]},


                                    ]
                                },

                            }
                        },
                        { $sort: { name: -1 } },
                        { $limit: 1 },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                abbreviation: 1
                            }
                        }
                    ],
                    as: "organization"
                }
            },
            {
                $unwind: {
                    path: "$organization",
                    preserveNullAndEmptyArrays: true
                }
            },
            ...(params?.organization && params?.organization !== ALL_FILTER
                ? [{ $match: {
                        "organization._id": params?.organization
                    } }]
                : [])
        ];
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const noPaginationPipeline = pipeline.concat(paginationPipe.getNoLimitPipeline());
        const submissionStudyIDs = await this.submissionCollection.distinct("studyID", organizationCondition);
        const promises = [
            this.submissionCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            this.submissionCollection.aggregate(noPaginationPipeline.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            this.submissionCollection.distinct("dataCommons", dataCommonsCondition),
            // note: Submitter name filter is omitted
            this.submissionCollection.distinct("submitterName", submitterNameCondition),
            // note: Organization ID filter is omitted
            this.organizationService.organizationCollection.aggregate([{
                $match: {
                        "studies._id": {$in: submissionStudyIDs}
                    }
            }, {
                $project: {_id: 1, name: 1, abbreviation: 1}
            }]),
            // note: Status name filter is omitted
            this.submissionCollection.distinct("status", statusCondition)
        ];
        let listSubmissions = await Promise.all(promises).then(function (results) {
            return {
                submissions: results[0] || [],
                total: results[1]?.length > 0 ? results[1][0]?.count : 0,
                dataCommons: results[2] || [],
                submitterNames: results[3] || [],
                organizations: results[4] || [],
                statuses: () => {
                    const statusOrder = [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, CANCELED, DELETED];
                    return (results[5] || [])
                        .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
                }
            }
        });
        return getDataCommonsDisplayNamesForListSubmissions(listSubmissions);
    }

    async createBatch(params, context) {
        // updated to handle both API-token and session.
        const userInfo = context?.userInfo
        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.DATA_FILE]);
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);

        this._verifyBatchPermission(aSubmission, userInfo?._id);

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
            await updateSubmissionStatus(this.submissionCollection, aSubmission, userInfo, IN_PROGRESS);
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

        const aSubmission = await findByID(this.submissionCollection, aBatch.submissionID);
        this._verifyBatchPermission(aSubmission, userInfo?._id);

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

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        return this.batchService.listBatches(params);
    }

  async getSubmission(params, context){
        verifySession(context)
            .verifyInitialized();

        let aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        const isNotPermitted = viewScope.isNoneScope();
        if (isNotPermitted) {
          throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        await Promise.all([
            // Store data file size into submission document
            (async () => {
                const dataFileSize = await this._getS3DirectorySize(aSubmission?.bucketName, `${aSubmission?.rootPath}/${FILE}/`);
                const isDataFileChanged = aSubmission?.dataFileSize?.size !== dataFileSize.size || aSubmission?.dataFileSize?.formatted !== dataFileSize.formatted;
                if (isDataFileChanged) {
                    const updatedSubmission = await this.submissionCollection.findOneAndUpdate({_id: aSubmission?._id}, {dataFileSize, updatedAt: getCurrentTime()}, {returnDocument: 'after', upsert: true});
                    if (!updatedSubmission?.value) {
                        throw new Error(ERROR.FAILED_RECORD_FILESIZE_PROPERTY, `SubmissionID: ${aSubmission?._id}`);
                    }
                }
                aSubmission.dataFileSize = dataFileSize;
            })(),
            (async () => {
                if (aSubmission?.studyID) {
                    const submissions = await this.submissionCollection.aggregate([
                        {"$match": {$and: [
                            {studyID: aSubmission.studyID},
                            {status: {$in: [IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN]}},
                            {_id: { $not: { $eq: params._id}}}]}}]);
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
                      await this.submissionCollection.update({_id: aSubmission?._id, updatedAt: getCurrentTime(), nodeCount: submissionNodeCount});
                      aSubmission.nodeCount = submissionNodeCount;
                  }
              }
            })(),
            (async () => {
              // add userName in each history
              for (const history of aSubmission?.history) {
                  if (history?.userName) continue;
                  if (!history?.userID) continue;
                  const user = await this.userService.getUserByID(history?.userID);
                  if (user) {
                      history.userName = user?.firstName + " " + user?.lastName;
                  }
              }
            })()
        ]);

        // Store the timestamp for the inactive submission purpose
        const conditionSubmitter = (context?.userInfo?.role === ROLES.SUBMITTER) && (context?.userInfo?._id === aSubmission?.submitterID);
        if (conditionSubmitter) {
            const everyReminderDays = this._getEveryReminderQuery(this.emailParams.remindSubmissionDay, false);
            const updateSubmission = await this.submissionCollection.findOneAndUpdate({_id: aSubmission?._id},
                {accessedAt: getCurrentTime(), ...everyReminderDays},
                {returnDocument: 'after'});
            aSubmission = updateSubmission.value;
        }
        let submission = {...aSubmission}
        return getDataCommonsDisplayNamesForSubmission(submission);
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
        let submission = await findByID(this.submissionCollection, submissionID);
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
        await this._isValidReleaseAction(action, submission?._id, submission?.studyID, submission?.crossSubmissionStatus);
        //update submission
        let events = submission.history || [];
        // admin permission and submit action only can leave a comment
        const isCommentRequired = ACTIONS.REJECT === action || (!verifier.isSubmitActionCommentRequired(submission, !userScope.isNoneScope(), params?.comment));
        events.push(HistoryEventBuilder.createEvent(userInfo._id, newStatus, isCommentRequired ? params?.comment : null));

        // When the status changes to COMPLETED, store the total data size of the S3 directory in the submission document.
        if (newStatus === COMPLETED) {
            submission.dataFileSize = dataFileSize;
        }
        submission = {
            ...submission,
            status: newStatus,
            history: events,
            updatedAt: getCurrentTime(),
            reviewComment: submission?.reviewComment || []
        }
        submission = getDataCommonsDisplayNamesForSubmission(submission);
        const updated = await this.submissionCollection.update(submission);
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            throw new Error(ERROR.UPDATE_SUBMISSION_ERROR);
        }
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
        await Promise.all([
            this.logCollection.insert(logEvent),
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
        const finalInactiveSubmissions = await this._getInactiveSubmissions(this.emailParams.finalRemindSubmissionDay - 1, FINAL_INACTIVE_REMINDER)
        if (finalInactiveSubmissions?.length > 0) {
            await Promise.all(finalInactiveSubmissions.map(async (aSubmission) => {
                await sendEmails.finalRemindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService);
            }));
            const submissionIDs = finalInactiveSubmissions
                .map(submission => submission._id);
            const query = {_id: {$in: submissionIDs}};
            // Disable all reminders to ensure no notifications are sent.
            const everyReminderDays = this._getEveryReminderQuery(this.emailParams.remindSubmissionDay, true);
            const updatedReminder = await this.submissionCollection.updateMany(query, everyReminderDays);
            if (!updatedReminder?.modifiedCount || updatedReminder?.modifiedCount === 0) {
                console.error("The email reminder flag intended to notify the inactive submission user (FINAL) is not being stored", `submissionIDs: ${submissionIDs.join(', ')}`);
            }
        }
        // Map over inactiveDays to create an array of tuples [day, promise]
        const inactiveSubmissionPromises = [];
        for (const day of this.emailParams.remindSubmissionDay) {
            const pastInactiveDays = this.emailParams.finalRemindSubmissionDay - day;
            inactiveSubmissionPromises.push([pastInactiveDays, await this._getInactiveSubmissions(pastInactiveDays, `${INACTIVE_REMINDER}_${day}`)]);
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
                const updatedReminder = await this.submissionCollection.update({_id: submissionID, ...reminderFilter});
                if (!updatedReminder?.modifiedCount || updatedReminder?.modifiedCount === 0) {
                    console.error("The email reminder flag intended to notify the inactive submission user is not being stored", submissionID);
                }
            }
        }

    }

    async _getInactiveSubmissions(inactiveDays, inactiveFlagField) {
        const remindCondition = {
            accessedAt: {
                $lt: subtractDaysFromNow(inactiveDays),
            },
            status: {
                $in: [NEW, IN_PROGRESS, REJECTED, WITHDRAWN]
            },
            // Tracks whether the notification has already been sent
            [inactiveFlagField]: {$ne: true}
        };
        return await this.submissionCollection.aggregate([{$match: remindCondition}]);
    }

    async _isValidReleaseAction(action, submissionID, studyID, crossSubmissionStatus) {
        if (action?.toLowerCase() === ACTIONS.RELEASE.toLowerCase()) {
            const submissions = await this.submissionCollection.aggregate([{"$match": {_id: {"$ne": submissionID}, studyID: studyID}}]);
            // Throw error if other submissions associated with the same study
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

        const aSubmission = await findByID(this.submissionCollection, params?._id);
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
        const aSubmission = await findByID(this.submissionCollection, params._id);
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
        // start validation, change validating status
        const [prevMetadataValidationStatus, prevFileValidationStatus, prevCrossSubmissionStatus, prevTime] =
            [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus, aSubmission?.crossSubmissionStatus, aSubmission?.updatedAt];

        await this._updateValidationStatus(params?.types, aSubmission, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, getCurrentTime());
        const validationRecord = ValidationRecord.createValidation(aSubmission?._id, params?.types, params?.scope, VALIDATION_STATUS.VALIDATING);
        const res = await this.validationCollection.insert(validationRecord);
        if (!res?.acknowledged) {
            throw new Error(ERROR.FAILED_INSERT_VALIDATION_OBJECT);
        }
        const result = await this.dataRecordService.validateMetadata(params._id, params?.types, params?.scope, validationRecord._id);
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

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const reviewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, aSubmission);
        if (reviewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION)
        }
        return this.dataRecordService.submissionCrossValidationResults(params.submissionID, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async listSubmissionNodeTypes(params, context) {
        verifySession(context)
            .verifyInitialized();

        const submissionID = params?._id;
        const aSubmission = await findByID(this.submissionCollection, submissionID);
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
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if (!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        if(!["All", "New", "Error", "Passed", "Warning"].includes(status)){
            throw new Error(ERROR.INVALID_NODE_STATUS_NOT_FOUND);
        }

        if (params?.nodeType !== DATA_FILE) {
            const query = {submissionID: submissionID, nodeType: nodeType};
            if (status !== "All") query.status = status;
            if (nodeID) query.nodeID = new RegExp(nodeID, 'i');
            const result = await this.dataRecordService.submissionNodes(submissionID, nodeType, 
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

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const viewScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, aSubmission);
        if (viewScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        return await this.dataRecordService.NodeDetail(params.submissionID, params.nodeType, params.nodeID);
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

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
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
        const result = await this.dataRecordService.RelatedNodes(params);
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
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        this._verifyBatchPermission(aSubmission, context?.userInfo?._id);
        //set parameters
        const parameters = {submissionID: params.submissionID, apiURL: params.apiURL, 
            dataFolder: (params.dataFolder)?  params.dataFolder : "/Users/my_name/my_files",
            manifest: (params.manifest)? params.manifest: "/Users/my_name/my_manifest.tsv"
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
        this._verifyBatchPermission(aSubmission, context?.userInfo?._id);

        // data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        const fileConfig = this._getModelFileNodeInfo(aSubmission, latestDataModel);
        const uploadingHeartbeatConfig = await this.configurationService.findByType(UPLOADING_HEARTBEAT_CONFIG_TYPE);
        const heartbeat_interval = (uploadingHeartbeatConfig && uploadingHeartbeatConfig.interval) ? uploadingHeartbeatConfig.interval : 300;
        return {id_field: fileConfig["id-field"],
            name_field: fileConfig["name-field"],
            size_field: fileConfig["size-field"],
            md5_field: fileConfig["md5-field"],
            omit_DCF_prefix: fileConfig["omit-DCF-prefix"],
            heartbeat_interval: heartbeat_interval
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
        const aSubmission = await findByID(this.submissionCollection, submissionID);
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
        for (const collaborator of collaborators) {
            //find a submitter with the collaborator ID
            const user = await findByID(this.userService.userCollection, collaborator.collaboratorID);
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
            collaborator.collaboratorName = user.lastName + ", " + user.firstName ;
            collaborator.Organization = user.organization;
        }
        // if passed validation
        aSubmission.collaborators = collaborators;  
        aSubmission.updatedAt = new Date();
        let submission = getDataCommonsDisplayNamesForSubmission(aSubmission);
        const result = await this.submissionCollection.update(submission);
        if (result?.modifiedCount === 1) {
            return submission;
        }
        else
            throw new Error(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
    }

    _verifyStudyInUserStudies(user, studyId){
        if(!user?.studies || user.studies.length === 0 )
            return false;
        const userStudy = (user.studies[0] instanceof Object)? user.studies.find(s=>s._id === studyId || s._id === "All"):
            user.studies.find(s=> s === studyId || s === "All"); //backward compatible
        return (userStudy)? true: false;
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

    async _getExistingDataFiles(fileNames, aSubmission) {
        const filePromises = fileNames
            .map(fileName =>
                this.s3Service.listFile(aSubmission.bucketName, `${aSubmission.rootPath}/${FILE}/${fileName}`)
            );
        const fileResults = await Promise.all(filePromises);
        const existingFiles = new Map();
        fileResults.forEach((file) => {
            const aFileContent = (file?.Contents)?.pop();
            const fileName = fileNames.find(fileName => `${aSubmission.rootPath}/${FILE}/${fileName}` === aFileContent?.Key);
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

    async _deleteDataFiles(existingFiles, aSubmission) {
        // Set a flag when initiating the deletion of S3 files.
        await this.submissionCollection.update({_id: aSubmission?._id, updatedAt: getCurrentTime(), deletingData: true});
        const existingFilesArr = Array.from(existingFiles.values());
        const promises = existingFilesArr.map(fileKey => this.s3Service.deleteFile(aSubmission?.bucketName, fileKey));
        const res = await Promise.allSettled(promises);
        const notDeletedErrorFiles = [];
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

        // remove the deleted s3 file in the submission's file error
        const errors = aSubmission?.fileErrors?.filter((fileError) => {
            const deletedFile = existingFiles.get(fileError?.submittedID);
            return notDeletedErrorFiles.includes(fileError.submittedID) || !deletedFile;
        }) || [];
        await this.submissionCollection.update({_id: aSubmission?._id, updatedAt: getCurrentTime(), fileErrors : errors, deletingData: false});
        return deletedFiles;
    }

    /**
     * archiveCompletedSubmissions
     * description: overnight job to set completed submission after retention with "archived = true", archive related data and delete s3 files
     */
    async archiveCompletedSubmissions(){
        const targetRetentionDate = new Date();
        targetRetentionDate.setDate(targetRetentionDate.getDate() - this.emailParams.completedSubmissionDays);
        const query = [{"$match": {"status": COMPLETED, "updatedAt": { "$lte": targetRetentionDate}}}];
        try {
            const archiveSubs = await this.submissionCollection.aggregate(query);
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
            await this.batchService.deleteBatchByFilter({"submissionID": submissionID});
            await this.submissionCollection.updateOne({"_id": submissionID}, {"archived": true, "updatedAt": new Date()});
        } else {
            console.error(`Failed to delete files in the s3 bucket. SubmissionID: ${submissionID}.`);
        }
    }

     /**
     * deleteInactiveSubmissions
     * description: overnight job to set inactive submission status to "Deleted", delete related data and files
     */
     async deleteInactiveSubmissions(){
        const query = [{"$match": {
                "status": {"$in":[IN_PROGRESS, NEW, REJECTED, WITHDRAWN]},
                "accessedAt": {"$exists": true, "$ne": null, "$lt": subtractDaysFromNow(this.emailParams.inactiveSubmissionDays)}}}];
        try {
            const inactiveSubs = await this.submissionCollection.aggregate(query);
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
                        await this.batchService.deleteBatchByFilter({"submissionID": sub._id});
                        await this.submissionCollection.updateOne({"_id": sub._id}, {"status" : DELETED, "updatedAt": new Date()});
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
            this.userService.userCollection.aggregate([{"$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EN.DATA_SUBMISSION.CREATE]},
                    "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
                    "dataCommons": {"$in": [aSubmission?.dataCommons]}

                }}]) || [],
            this.userService.userCollection.aggregate([{"$match": {
                    "userStatus": USER.STATUSES.ACTIVE,
                    "notifications": {"$in": [EN.DATA_SUBMISSION.CREATE]},
                    "$or": [{"role": USER.ROLES.ADMIN}, {"role": USER.ROLES.FEDERAL_LEAD}]
                }}]) || []
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
            this.userService.approvedStudiesCollection.find(aSubmission?.studyID)
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
                 studyName: approvedStudy?.length > 0 ? (approvedStudy[0]?.studyName || NA) : NA,
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
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        if (aSubmission.status === RELEASED) {
            throw new Error(ERROR.INVALID_DELETE_SUBMISSION_STATUS);
        }

        const createScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        const isNotPermitted = !this._isCollaborator(context?.userInfo, aSubmission) && createScope.isNoneScope();
        if (isNotPermitted) {
            throw new Error(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION)
        }

        if (params?.nodeType === VALIDATION.TYPES.DATA_FILE) {
            const existingFiles = await this._getExistingDataFiles(params.nodeIDs, aSubmission);
            // note: file not existing in the s3 bucket should be deleted
            const notExistingFileNames = params.nodeIDs.filter(item => !existingFiles.has(item));
            await this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, notExistingFileNames);
            if (existingFiles.size === 0) {
                return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
            }
            const deletedFiles = await this._deleteDataFiles(existingFiles, aSubmission);
            if (deletedFiles.length > 0) {
                const [submissionDataFiles, dataFileSize] = await Promise.all([
                    // note: file deleted in s3 bucket should be deleted
                    this._getAllSubmissionDataFiles(aSubmission?.bucketName, aSubmission?.rootPath),
                    this._getS3DirectorySize(aSubmission?.bucketName, `${aSubmission?.rootPath}/${FILE}/`),
                    // note: file deleted in s3 bucket should be deleted
                    this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, deletedFiles),
                    this._logDataRecord(context?.userInfo, aSubmission._id, VALIDATION.TYPES.DATA_FILE, deletedFiles),
                ]);
                // note: reset fileValidationStatus if the number of data files changed. No data files exists if null
                const fileValidationStatus = submissionDataFiles.length > 0 ? VALIDATION_STATUS.NEW : null;
                await this.submissionCollection.updateOne({_id: aSubmission?._id}, {fileValidationStatus: fileValidationStatus, dataFileSize, updatedAt: getCurrentTime()});
            }
            return ValidationHandler.success(`${deletedFiles.length} extra files deleted`)
        }

        const msg = {type: DELETE_METADATA, submissionID: params.submissionID, nodeType: params.nodeType, nodeIDs: params.nodeIDs}
        const success = await this._requestDeleteDataRecords(msg, this.sqsLoaderQueue, params.submissionID, params.submissionID);
        const updated = await this.submissionCollection.updateOne({_id: aSubmission?._id}, {deletingData: isTrue(success?.success), updatedAt: getCurrentTime()});
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            console.error(ERROR.FAILED_UPDATE_DELETE_STATUS, aSubmission?._id);
            throw new Error(ERROR.FAILED_UPDATE_DELETE_STATUS);
        }

        if (isTrue(success?.success)) {
            await this._logDataRecord(context?.userInfo, aSubmission._id, params.nodeType, params.nodeIDs);
        }
        return success;
    }

    async listPotentialCollaborators(params, context) {
        verifySession(context)
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection, params?.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }

        if (aSubmission.submitterID !== context?.userInfo?._id) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        // find Collaborators with aSubmission.studyID
        let collaborators = await this.userService.getCollaboratorsByStudyID(aSubmission.studyID, aSubmission.submitterID);
        return collaborators.map((user) => {
           return getDataCommonsDisplayNamesForUser(user);
        });
    }

    /**
     * API: update the data-model version for the submission.
     * @param {*} params
     * @param {*} context
     * @returns {Promise<Submission>}
     */
    async updateSubmissionModelVersion(params, context) {
        verifySession(context)
            .verifyInitialized();

        const {_id, version} = params;
        const aSubmission = await findByID(this.submissionCollection, _id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW, aSubmission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const dataModels = await this.fetchDataModelInfo();
        const validVersions = this._getAllModelVersions(dataModels, aSubmission?.dataCommons);

        if (!validVersions.includes(version)) {
            throw new Error(replaceErrorString(ERROR.INVALID_MODEL_VERSION, `${version || " "}`));
        }

        if (![IN_PROGRESS, NEW].includes(aSubmission?.status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_SUBMISSION_STATUS_MODEL_VERSION, `${aSubmission?.status}`));
        }

        const userInfo = context.userInfo;
        const isPermitted = userInfo.role === ROLES.DATA_COMMONS_PERSONNEL && userInfo.dataCommons?.includes(aSubmission?.dataCommons);
        if (!isPermitted) {
            throw new Error(ERROR.INVALID_MODEL_VERSION_PERMISSION);
        }

        if (aSubmission?.modelVersion === version) {
            return aSubmission;
        }
        const updatedSubmission = await this.submissionCollection.findOneAndUpdate(
            {_id: aSubmission?._id, modelVersion: {"$ne": version}}, { // update condition
                // Update documents
                modelVersion: version,
                updatedAt: getCurrentTime()},
            {returnDocument: 'after'}
        );
        await this._resetValidation(aSubmission?._id);
        return updatedSubmission?.value;
    }

    async _resetValidation(aSubmissionID){
        const [resetSubmission, resetDataRecords, resetQCResult] = await Promise.all([
            this.submissionCollection.findOneAndUpdate(
                {_id: aSubmissionID}, { // update condition
                    // Update documents
                    updatedAt: getCurrentTime(),
                    metadataValidationStatus: VALIDATION_STATUS.NEW,
                    fileValidationStatus: VALIDATION_STATUS.NEW,
                    crossSubmissionStatus: VALIDATION_STATUS.NEW},
                {returnDocument: 'after'}
            ),
            this.dataRecordService.resetDataRecords(aSubmissionID, VALIDATION_STATUS.NEW),
            this.qcResultsService.resetQCResultData(aSubmissionID)
        ]);

        if (!resetSubmission.value) {
            const errorMsg = `${ERROR.FAILED_RESET_SUBMISSION}; SubmissionID: ${aSubmissionID}`;
            console.error(errorMsg)
            throw new Error(errorMsg);
        }

        if (!resetDataRecords.acknowledged) {
            const errorMsg = `${ERROR.FAILED_RESET_DATA_RECORDS}; SubmissionID: ${aSubmissionID}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        if (!resetQCResult.acknowledged) {
            const errorMsg = `${ERROR.FAILED_RESET_QC_RESULT}; SubmissionID: ${aSubmission?._id}`;
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
        const submission = await this.submissionCollection.findOne(submissionID);
        if (!submission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW, submission);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const results = await this.dataRecordService.getReleasedAndNewNode(submissionID, submission.dataCommons, nodeType, nodeID, status);
        // the results is array of nodes, [new, release]
        if(results && results.length === 2)  
        {
            return results.map((releasedNode) => {
               return getDataCommonsDisplayNamesForReleasedNode(releasedNode);
            });
        }
        else
        {
            return null;
        }
    }

    async verifyTempCredential(submissionID, userInfo) {
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        if(!aSubmission.rootPath)
            throw new Error(`${ERROR.VERIFY.EMPTY_ROOT_PATH}, ${submissionID}!`);

        const submitterCollaborator = (aSubmission?.collaborators || []).map(u => u.collaboratorID);
        const isCollaborator = submitterCollaborator.includes(userInfo?._id);

        const userScope = await this._getUserScope(userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, aSubmission);
        if (userScope.isNoneScope() && !isCollaborator) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return aSubmission;
    }

    async _logDataRecord(userInfo, submissionID, nodeType, nodeIDs) {
        const userName = `${userInfo?.lastName ? userInfo?.lastName + ',' : ''} ${userInfo?.firstName || NA}`;
        const logEvent = DeleteRecordEvent.create(userInfo._id, userInfo.email, userName, submissionID, nodeType, nodeIDs);
        await this.logCollection.insert(logEvent);
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
        const updated = await this.submissionCollection.update({_id: aSubmission?._id, ...typesToUpdate, updatedAt: updatedTime, validationEnded: new Date()});
        if(validationRecord){
            validationRecord["ended"] = new Date();
            validationRecord["status"] = "Error";
            await this.validationCollection.updateOne({_id: validationRecord["_id"]}, validationRecord);
        }
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
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
        let updated = await this.submissionCollection.findOneAndUpdate({_id: submissionID}, {...dataValidation, updatedAt: getCurrentTime()}, {returnDocument: 'after'});
        if (!updated?.value) {
            throw new Error(ERROR.FAILED_RECORD_VALIDATION_PROPERTY);
        }
        return updated.value;
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

    _listConditions(userInfo, status, submissionName, dbGaPID, dataCommonsParams, submitterName, userScope){
        const {_id, dataCommons, studies} = userInfo;
        const validSubmissionStatus = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
            REJECTED, WITHDRAWN, DELETED];
        const statusCondition = status && !status?.includes(ALL_FILTER) ?
            { status: { $in: status || [] } } : { status: { $in: validSubmissionStatus } };

        const nameCondition = submissionName ? {name: { $regex: submissionName?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const dbGaPIDCondition = dbGaPID ? {dbGaPID: { $regex: dbGaPID?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const dataCommonsCondition = (dataCommonsParams && dataCommonsParams !== ALL_FILTER) ? {dataCommons: dataCommonsParams?.trim()} : {};
        const submitterNameCondition = (submitterName && submitterName !== ALL_FILTER) ? {submitterName: submitterName?.trim()} : {};

        const baseConditions = { ...statusCondition, ...nameCondition,
            ...dbGaPIDCondition, ...dataCommonsCondition, ...submitterNameCondition };

        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            const studyQuery = isAllStudy(studyScope?.scopeValues) ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, ...studyQuery};
        } else if (userScope.isDCScope()) {
            const DCScope = userScope.getDataCommonsScope();
            const aFilteredDataCommon = (dataCommonsParams && DCScope?.scopeValues?.includes(dataCommonsParams)) ? [dataCommonsParams] : []
            return {...baseConditions, dataCommons: {$in: dataCommonsParams !== ALL_FILTER ? aFilteredDataCommon : dataCommons}};
        } else if (userScope.isOwnScope()) {
            const userStudies = Array.isArray(studies) && studies.length > 0 ? studies : [];
            const studyIDs = userStudies?.map(s => s?._id).filter(Boolean);
            if (isAllStudy(userStudies)) {
                return baseConditions;
            }
            return {...baseConditions, "$or": [
                    {"submitterID": _id},
                    {"studyID": {$in: studyIDs || []}},
                    {"collaborators.collaboratorID": _id, "collaborators.permission": {$in: [COLLABORATOR_PERMISSIONS.CAN_EDIT]}}]};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
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
        const aSubmission = await findByID(this.submissionCollection, aBatch?.submissionID);
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

        let aSubmission = await findByID(this.submissionCollection, params?.submissionID);
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

    _verifyBatchPermission(aSubmission, userID) {
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        // Only for Data Submission Owner / Collaborators
        const submitterCollaborator = (aSubmission?.collaborators || []).map(u => u.collaboratorID);
        const isCollaborator = submitterCollaborator.includes(userID);
        if (!isCollaborator && userID !== aSubmission?.submitterID) {
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
        // DC scope, study scope, own scope including collaborator, and role scope is missing valid scope values
        if (aSubmission && ((isOwnScope && (userInfo?._id !== aSubmission?.submitterID && !this._isCollaborator(userInfo, aSubmission))) ||
            isStudyScope && !userScope.hasStudyValue(aSubmission?.studyID) ||
            isDCScope && !userScope.hasDCValue(aSubmission?.dataCommons) ||
            isRoleScope && !userScope.getRoleScope()?.scopeValues?.length === 0
        )) {
            const errorMsg = replaceErrorString(ERROR.INVALID_SCOPE_VALUES, aPermission) + `SubmissionID: ${aSubmission?._id}, userID: ${userInfo?._id}`
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        const isValidUserScope = userScope.isNoneScope() || isOwnScope || userScope.isAllScope() ||
            isRoleScope || isStudyScope || isDCScope;
        if (!isValidUserScope) {
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }
     async downloadDBGaPLoadSheet(params, context) {
        verifySession(context)
            .verifyInitialized();
        const {
            submissionID: submissionID
        } = params;
        const aSubmission = await findByID(this.submissionCollection, submissionID);
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
            await zipFilesInDir(zipDir, zipFile);
            if (!fs.existsSync(zipFile)) {
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
            const downloadDir = path.dirname(zipFile);
            if (downloadDir && fs.existsSync(downloadDir)) {
                fs.rmSync(downloadDir, {recursive: true, force: true });
            }
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
                conciergeName: aOrganization?.conciergeName || NA,
                conciergeEmail: `${aOrganization?.conciergeEmail || NA}.`
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
                conciergeEmail: `${aOrganization?.conciergeEmail || NA}.`,
                conciergeName: aOrganization?.conciergeName || NA
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
                conciergeEmail: `${aOrganization?.conciergeEmail || NA}.`,
                conciergeName: aOrganization?.conciergeName || NA
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

const isAllStudy = (userStudies) => {
    const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
    return studies.find(study =>
        (typeof study === 'object' && study._id === "All") ||
        (typeof study === 'string' && study === "All")
    );
}

const getUserEmails = (users) => {
    return users
        ?.filter((aUser) => aUser?.email)
        ?.map((aUser)=> aUser.email);
}


const findByID = async (submissionCollection, id) => {
    const submissions = await submissionCollection.aggregate([
        {"$match": {_id: id}},
        {"$lookup": {
                from: ORGANIZATION_COLLECTION,
                let: {studyId: "$studyID"},
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: ["$$studyId", "$studies._id"]
                            }
                        }
                    },
                    {
                        $sort: {
                            name: -1 // THIS MUST BE DESC TO LIST SUBMISSIONS PROPERLY
                        }
                    },
                    {
                        $limit: 1
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            abbreviation: 1
                        }
                    }
                ],
                as: "organization"
            }
        },
        {$unwind: {
                path: "$organization",
                preserveNullAndEmptyArrays: true
            }
        }
    ]);
    return (submissions?.length > 0) ? submissions[0] : null;
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

function validateListSubmissionsParams (params) {
    const validStatus = new Set([NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED, ALL_FILTER]);
    const invalidStatues = (params?.status || [])
        .filter((i) => !validStatus.has(i));
    if (invalidStatues?.length > 0) {
        throw new Error(replaceErrorString(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER, `'${invalidStatues.join(",")}'`));
    }
}

class ValidationRecord {
    // submissionID: string
    // type: array
    // scope: array
    // started: Date
    // status: string
    constructor(submissionID, type, scope, status) {
        this._id = v4();
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

class DataSubmission {
    _SUBMISSIONS = "submissions";
    constructor(name, userInfo, dataCommons, dbGaPID, aProgram, modelVersion, intention, dataType, approvedStudy, submissionBucketName) {
        this._id = v4();
        this.name = name;
        this.submitterID = userInfo._id;
        this.collaborators = [];
        this.submitterName = formatName(userInfo);
        this.dataCommons = dataCommons;
        this.modelVersion = modelVersion;
        this.studyID = approvedStudy?._id;
        this.dbGaPID = dbGaPID;
        this.status = NEW;
        this.history = [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)];
        this.organization = {
            _id: (aProgram && aProgram?._id) ? aProgram?._id : null,
            name: (aProgram && aProgram?.name) ? aProgram?.name : null,
            abbreviation: (aProgram && aProgram?.abbreviation) ? aProgram?.abbreviation : null
        };
        this.bucketName = submissionBucketName;
        this.rootPath = `${this._SUBMISSIONS}/${this._id}`;
        this.conciergeName = this._getConciergeName(approvedStudy, aProgram);
        this.conciergeEmail = this._getConciergeEmail(approvedStudy, aProgram);
        this.createdAt = this.updatedAt = getCurrentTime();
        // no metadata to be validated
        this.metadataValidationStatus = this.fileValidationStatus = this.crossSubmissionStatus = null;
        this.fileErrors = [];
        this.fileWarnings = [];
        this.intention = intention;
        this.dataType = dataType;
        this.studyAbbreviation = approvedStudy?.studyAbbreviation;
        this.studyName = approvedStudy?.studyName;
        if (!isUndefined(approvedStudy?.controlledAccess)) {
            this.controlledAccess = approvedStudy.controlledAccess;
        }
        this.ORCID = approvedStudy?.ORCID || null;
        this.accessedAt = getCurrentTime();
        this.dataFileSize = FileSize.createFileSize(0);
    }

    static createSubmission(name, userInfo, dataCommons, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName) {
        return new DataSubmission(name, userInfo, dataCommons, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName);
    }

    _getConciergeName(approvedStudy, aProgram){
        if (approvedStudy?.primaryContact) {
            const conciergeName = `${approvedStudy.primaryContact?.firstName} ${approvedStudy.primaryContact?.lastName || ''}`;
            return conciergeName?.trim();
        } else if (aProgram) {
            return aProgram?.conciergeName;
        } else {
            return null;
        }
    }
    _getConciergeEmail(approvedStudy, aProgram){
        if (approvedStudy?.primaryContact) {
            return approvedStudy.primaryContact.email;
        } else if (aProgram) {
            return aProgram?.conciergeEmail;
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

