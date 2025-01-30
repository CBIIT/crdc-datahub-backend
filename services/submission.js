const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS, INTENTION, DATA_TYPE, DELETED, DATA_FILE,
    CONSTRAINTS, COLLABORATOR_PERMISSIONS
} = require("../constants/submission-constants");
const {v4} = require('uuid')
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
const {isUndefined, replaceErrorString, isValidFileExtension} = require("../utility/string-util");
const {NODE_RELATION_TYPES} = require("./data-record-service");
const {verifyToken} = require("../verifier/token-verifier");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {EMAIL_NOTIFICATIONS: EN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const FILE = "file";

const DATA_MODEL_SEMANTICS = 'semantics';
const DATA_MODEL_FILE_NODES = 'file-nodes';
const COMPLETE_SUBMISSION = "Complete Submission";
const GENERATE_DCF_MANIFEST = "Generate DCF Manifest";
const DELETE_METADATA = "Delete Metadata";
const INACTIVE_REMINDER = "inactiveReminder";
const FINAL_INACTIVE_REMINDER = "finalInactiveReminder";

const SUBMISSION_ID = "Submission ID";
const DATA_SUBMISSION_TYPE = "Data Submission Type";
const DESTINATION_LOCATION = "Destination Location";
const SUBMISSION_STATS_ORIGIN_API = "API: submissionStats";
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService,
                dataRecordService, fetchDataModelInfo, awsService, metadataQueueName, s3Service, emailParams, dataCommonsList,
                hiddenDataCommonsList, validationCollection, sqsLoaderQueue, qcResultsService, uploaderCLIConfigs, submissionBucketName) {
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
    }

    async createSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE);
        const userInfo = context?.userInfo;
        const hasStudies = userInfo?.studies?.length > 0;
        const roleWithoutStudies = userInfo?.role === ROLES.DATA_COMMONS_PERSONNEL;
        if (!hasStudies && !roleWithoutStudies){
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }

        if (!isAllStudy(userInfo.studies) && !roleWithoutStudies) {
            const study = userInfo.studies.find(study =>
                // TODO remove multiple types after data migration
                (typeof study === 'object' && study._id === params.studyID) ||
                (typeof study === 'string' && study === params.studyID)
            );
            if (!study) {
                throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
            }
        }

        if (!isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, {studyID: params.studyID, dataCommons: params.dataCommons, submitterID: userInfo?._id})) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const intention = [INTENTION.UPDATE, INTENTION.DELETE].find((i) => i.toLowerCase() === params?.intention.toLowerCase());
        const dataType = [DATA_TYPE.METADATA_AND_DATA_FILES, DATA_TYPE.METADATA_ONLY].find((i) => i.toLowerCase() === params?.dataType.toLowerCase());
        validateCreateSubmissionParams(params, this.allowedDataCommons, this.hiddenDataCommons, intention, dataType, context?.userInfo);
        const [approvedStudies, modelVersion, program] = await Promise.all([
            this.#findApprovedStudies([params.studyID]),
            (async () => {
                const latestDataModel = await this.fetchDataModelInfo();
                return this.#getModelVersion(latestDataModel, params.dataCommons);
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
        if (approvedStudy?.primaryContactID) {
            approvedStudy.primaryContact = await this.userService.getUserByID(approvedStudy.primaryContactID)
        }
        const newSubmission = DataSubmission.createSubmission(
            params.name, context.userInfo, params.dataCommons, params.studyID, approvedStudy?.dbGaPID, program, modelVersion, intention, dataType, approvedStudy, this.submissionBucketName);
        const res = await this.submissionCollection.insert(newSubmission);
        if (!(res?.acknowledged)) {
            throw new Error(ERROR.CREATE_SUBMISSION_INSERTION_ERROR);
        }
        return newSubmission;
    }
    async #findApprovedStudies(studies) {
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
        let userInfoVerifier = verifySession(context)
            .verifyInitialized();
        try{
            userInfoVerifier.verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        }
        catch(permissionError){
            console.warn(permissionError);
            console.warn("Failed permission verification for listSubmissions, returning empty list");
            return {submissions: [], total: 0};
        }
        validateListSubmissionsParams(params);

        const filterConditions = [
            // default filter for listing submissions
            this.#listConditions(context?.userInfo, params.status, params.organization, params.name, params.dbGaPID, params.dataCommons, params?.submitterName),
            // no filter for dataCommons aggregation
            this.#listConditions(context?.userInfo, ALL_FILTER, ALL_FILTER, null, null, ALL_FILTER, ALL_FILTER),
            // note: Aggregation of Submitter name should not be filtered by a submitterName
            this.#listConditions(context?.userInfo, params?.status, params.organization, params.name, params.dbGaPID, params.dataCommons, ALL_FILTER),
            // note: Aggregation of Organization name should not be filtered by a organization
            this.#listConditions(context?.userInfo, params?.status, ALL_FILTER, params.name, params.dbGaPID, params.dataCommons, params?.submitterName),
        ]

        const [listConditions, dataCommonsCondition, submitterNameCondition, organizationCondition] = filterConditions;
        const pipeline = [{"$match": listConditions}];
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const noPaginationPipeline = pipeline.concat(paginationPipe.getNoLimitPipeline());
        const promises = [
            await this.submissionCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            await this.submissionCollection.aggregate(noPaginationPipeline.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            await this.submissionCollection.distinct("dataCommons", dataCommonsCondition),
            // note: Submitter name filter is omitted
            await this.submissionCollection.distinct("submitterName", submitterNameCondition),
            // note: Organization ID filter is omitted
            await this.submissionCollection.distinct("organization", organizationCondition)
        ];
        
        return await Promise.all(promises).then(function(results) {
            return {
                submissions: results[0] || [],
                total: results[1]?.length > 0 ? results[1][0]?.count : 0,
                dataCommons: results[2] || [],
                submitterNames: results[3] || [],
                organizations: results[4] || []
            }
        });
    }

    async createBatch(params, context) {
        // updated to handle both API-token and session.
        const userInfo = context?.userInfo
        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .type([BATCH.TYPE.METADATA, BATCH.TYPE.DATA_FILE]);
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
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
        if (![BATCH.STATUSES.UPLOADING].includes(aBatch?.status)) {
            throw new Error(ERROR.INVALID_UPDATE_BATCH_STATUS);
        }
        const aSubmission = await findByID(this.submissionCollection, aBatch.submissionID);
        // submission owner & submitter's Org Owner
        await verifyBatchPermission(this.userService, aSubmission, userInfo);
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
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        const aSubmission = await findByID(this.submissionCollection,params?.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        const collaborativeUsers =  await this.userService.getCollaboratorsByStudyID(aSubmission.studyID, aSubmission.submitterID);
        params.collaboratorUserIDs = collaborativeUsers.map(u => u._id);
        return this.batchService.listBatches(params, context);
    }

  async getSubmission(params, context){
        verifySession(context)
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        let aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        // add userName in each history
        for (const history of aSubmission.history) {
            const user = await this.userService.getUserByID(history.userID);
            history.userName = user.firstName + " " + user.lastName;
        }
        if (aSubmission?.studyID) {
            // if user role is Federal Monitor, only can access his studies.
            if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
                throw new Error(ERROR.INVALID_ROLE_STUDY);
            }
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

        // dynamically count records in dataRecords
        if (!aSubmission?.archived) {
          const submissionNodeCount = await this.dataRecordService.countNodesBySubmissionID(aSubmission?._id);
          if (aSubmission.nodeCount !== submissionNodeCount) {
              await this.submissionCollection.update({_id: aSubmission?._id, updatedAt: getCurrentTime(), nodeCount: submissionNodeCount});
              aSubmission.nodeCount = submissionNodeCount;
          }
        }

        const conditionSubmitter = (context?.userInfo?.role === ROLES.SUBMITTER) && (context?.userInfo?._id === aSubmission?.submitterID);
        if (await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            // Store the timestamp for the inactive submission purpose
            if (conditionSubmitter) {
                const everyReminderDays = this.#getEveryReminderQuery(this.emailParams.remindSubmissionDay, false);
                const updateSubmission = await this.submissionCollection.findOneAndUpdate({_id: aSubmission?._id},
                    {accessedAt: getCurrentTime(), ...everyReminderDays},
                    {returnDocument: 'after'});
                aSubmission = updateSubmission.value;
            }
            // add userName in each history
            for (const history of aSubmission?.history) {
                if (history?.userName) continue;
                if (!history?.userID) continue;
                const user = await this.userService.getUserByID(history.userID);
                history.userName = user.firstName + " " + user.lastName;
            }
            return aSubmission
        }
        throw new Error(ERROR.INVALID_ROLE);
    }

    async #isViewablePermission(userInfo, aSubmission) {
        const collaborativeUsers =  await this.userService.getCollaboratorsByStudyID(aSubmission.studyID, aSubmission.submitterID);
        const collaborativeUserIDs = collaborativeUsers.map(u => u._id);
        const conditionCollaborator = collaborativeUserIDs.includes(userInfo?._id);
        return isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, aSubmission) || conditionCollaborator;
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
        const userInfo = context.userInfo;
        // verify if the action is valid based on current submission status
        const verifier = verifySubmissionAction(action, submission.status, comment);
        const collaboratorUserIDs = Collaborators.createCollaborators(submission?.collaborators).getEditableCollaboratorIDs();
        // User has valid permissions or collaborator, valid user scope
        if (!(verifier.isValidPermissions(action, userInfo?._id, userInfo?.permissions, collaboratorUserIDs)
            && isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, submission))) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        const newStatus = verifier.getNewStatus();
        const isAdminAction = userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.ADMIN_SUBMIT);
        verifier.isValidSubmitAction(isAdminAction, submission, params?.comment);
        await this.#isValidReleaseAction(action, submission?._id, submission?.studyID, submission?.crossSubmissionStatus);
        //update submission
        let events = submission.history || [];
        // admin permission and submit action only can leave a comment
        const isCommentRequired = ACTIONS.REJECT === action || (!verifier.isSubmitActionCommentRequired(submission, isAdminAction, params?.comment));
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
            completePromise.push(this.#sendCompleteMessage({type: COMPLETE_SUBMISSION, submissionID}, submissionID));
        }
        if (action === ACTIONS.RELEASE) {
            completePromise.push(this.dataRecordService.exportMetadata(submissionID));
            completePromise.push(this.#sendCompleteMessage({type: GENERATE_DCF_MANIFEST, submissionID}, submissionID));
        }

        //log event and send notification
        const logEvent = SubmissionActionEvent.create(userInfo._id, userInfo.email, userInfo.IDP, submission._id, action, verifier.getPrevStatus(), newStatus);
        await Promise.all([
            this.logCollection.insert(logEvent),
            submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService, this.emailParams),
            this.#archiveCancelSubmission(action, submissionID, submission?.bucketName, submission?.rootPath)
        ].concat(completePromise));
        return submission;
    }

    async #archiveCancelSubmission(action, submissionID, bucketName, rootPath) {
        if (action === ACTIONS.CANCEL) {
            try {
                await this.#archiveSubmission(submissionID, bucketName, rootPath);
                console.debug(`Successfully archive canceled submissions: ${submissionID}.`);
            } catch (e) {
                console.error(`Failed to delete files under archived canceled submission: ${submissionID} with error: ${e.message}.`);
            }
        }
    }

    async remindInactiveSubmission() {
        // The system sends an email reminder a day before the data submission expires
        const finalInactiveSubmissions = await this.#getInactiveSubmissions(this.emailParams.finalRemindSubmissionDay - 1, FINAL_INACTIVE_REMINDER)
        if (finalInactiveSubmissions?.length > 0) {
            await Promise.all(finalInactiveSubmissions.map(async (aSubmission) => {
                await sendEmails.finalRemindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService);
            }));
            const submissionIDs = finalInactiveSubmissions
                .map(submission => submission._id);
            const query = {_id: {$in: submissionIDs}};
            // Disable all reminders to ensure no notifications are sent.
            const everyReminderDays = this.#getEveryReminderQuery(this.emailParams.remindSubmissionDay, true);
            const updatedReminder = await this.submissionCollection.updateMany(query, everyReminderDays);
            if (!updatedReminder?.modifiedCount || updatedReminder?.modifiedCount === 0) {
                console.error("The email reminder flag intended to notify the inactive submission user (FINAL) is not being stored", `submissionIDs: ${submissionIDs.join(', ')}`);
            }
        }
        // Map over inactiveDays to create an array of tuples [day, promise]
        const inactiveSubmissionPromises = [];
        for (const day of this.emailParams.remindSubmissionDay) {
            const pastInactiveDays = this.emailParams.finalRemindSubmissionDay - day;
            inactiveSubmissionPromises.push([pastInactiveDays, await this.#getInactiveSubmissions(pastInactiveDays, `${INACTIVE_REMINDER}_${day}`)]);
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

    async #getInactiveSubmissions(inactiveDays, inactiveFlagField) {
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

    async #isValidReleaseAction(action, submissionID, studyID, crossSubmissionStatus) {
        if (action?.toLowerCase() === ACTIONS.RELEASE.toLowerCase()) {
            const submissions = await this.submissionCollection.aggregate([{"$match": {_id: {"$ne": submissionID}, studyID: studyID}}]);
            // Throw error if other submissions associated with the same study
            // are some of them are in "Submitted" status if cross submission validation is not Passed.
            if (submissions?.some(i => i?.status === SUBMITTED) && crossSubmissionStatus !== VALIDATION_STATUS.PASSED) {
                throw new Error(ERROR.VERIFY.INVALID_RELEASE_ACTION);
            }
        }
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
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        const aSubmission = await findByID(this.submissionCollection, params?._id);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        const [orphanedFiles, submissionStats] = await this.dataRecordService.submissionStats(aSubmission);
        const isNodeError = await this.dataRecordService.isNodeErrorsBySubmissionID(aSubmission?._id);

        const qcRecords = await this.#generateQCRecord(orphanedFiles, aSubmission._id);
        if (qcRecords.length > 0) {
            await this.qcResultsService.insertErrorRecord(aSubmission?._id, qcRecords);
        }
        if (aSubmission.fileValidationStatus !== VALIDATION_STATUS.ERROR && isNodeError) {
            await this.submissionCollection.update({
                _id: aSubmission?._id,
                updatedAt: getCurrentTime(),
                fileValidationStatus : VALIDATION_STATUS.ERROR
            });
        }
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
        if (!this.#isValidAction(userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_VALIDATE_METADATA)
        }
        // start validation, change validating status
        const [prevMetadataValidationStatus, prevFileValidationStatus, prevCrossSubmissionStatus, prevTime] =
            [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus, aSubmission?.crossSubmissionStatus, aSubmission?.updatedAt];

        await this.#updateValidationStatus(params?.types, aSubmission, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, VALIDATION_STATUS.VALIDATING, getCurrentTime());
        const validationRecord = ValidationRecord.createValidation(aSubmission?._id, params?.types, params?.scope, VALIDATION_STATUS.VALIDATING);
        const res = await this.validationCollection.insert(validationRecord);
        if (!res?.acknowledged) {
            throw new Error(ERROR.FAILED_INSERT_VALIDATION_OBJECT);
        }
        const result = await this.dataRecordService.validateMetadata(params._id, params?.types, params?.scope, validationRecord._id);
        const updatedSubmission = await this.#recordSubmissionValidation(params._id, validationRecord, params?.types, aSubmission);
        // roll back validation if service failed
        if (!result.success) {
            if (result.message && result.message.includes(ERROR.NO_VALIDATION_METADATA)) {
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) 
                    await this.#updateValidationStatus(params?.types, updatedSubmission, null, prevFileValidationStatus, null, getCurrentTime(), validationRecord);
                else {
                    await this.#updateValidationStatus(params?.types, updatedSubmission, null, "NA", null, getCurrentTime(), validationRecord);
                    result.success = true;
                }
            } 
            else if (result.message && result.message.includes(ERROR.NO_NEW_VALIDATION_METADATA)){
                if (result.message.includes(ERROR.FAILED_VALIDATE_FILE))
                    await this.#updateValidationStatus(params?.types, updatedSubmission, prevMetadataValidationStatus, prevFileValidationStatus, null, prevTime, validationRecord);
                else {
                    await this.#updateValidationStatus(params?.types, updatedSubmission, prevMetadataValidationStatus, "NA", null, prevTime, validationRecord);
                    result.success = true;
                }
            } else if (result.message && result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION)) {
                await this.#updateValidationStatus(params?.types, updatedSubmission, null, null, prevCrossSubmissionStatus, prevTime, validationRecord);
            } else {
                const metadataValidationStatus = result.message.includes(ERROR.FAILED_VALIDATE_METADATA) ? prevMetadataValidationStatus : "NA";
                const fileValidationStatus = (result.message.includes(ERROR.FAILED_VALIDATE_FILE)) ? prevFileValidationStatus : "NA";
                const crossSubmissionStatus = result.message.includes(ERROR.FAILED_VALIDATE_CROSS_SUBMISSION) ? prevCrossSubmissionStatus : "NA";
                await this.#updateValidationStatus(params?.types, updatedSubmission, metadataValidationStatus, fileValidationStatus, crossSubmissionStatus, prevTime, validationRecord);
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
    // TODO remove
    async exportSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.CURATOR, ROLES.SUBMITTER]);
        const aSubmission = await findByID(this.submissionCollection, params._id);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        const userInfo = context.userInfo;
        const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
        const isCollaborator = collaboratorUserIDs.includes(userInfo._id);
        const isPermitted = (this.userService.isAdmin(userInfo.role) ||
            aSubmission?.submitterID === userInfo?._id || // Submitter
            (userInfo.role === ROLES.CURATOR && userInfo?.dataCommons.includes(aSubmission?.dataCommons)) || isCollaborator)
        if (!isPermitted) {
            throw new Error(ERROR.INVALID_EXPORT_METADATA);
        }
        if (aSubmission.status !== SUBMITTED) {
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${EXPORT}!`);
        }
        return await this.dataRecordService.exportMetadata(params._id);
    }

    async submissionCrossValidationResults(params, context){
        verifySession(context)
            .verifyInitialized()

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        const userInfo = context.userInfo;
        if (!(userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW) &&
            isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, aSubmission))) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return this.dataRecordService.submissionCrossValidationResults(params.submissionID, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async listSubmissionNodeTypes(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        const submissionID = params?._id;
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
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
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
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

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
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
            return this.#ProcessSubmissionNodes(result);
        }
        else {
             //1) cal s3 listObjectV2
            return await this.s3Service.listFileInDir(aSubmission.bucketName,  `${aSubmission.rootPath}/${FILE}/`)
                .then(result => 
                {
                    //process the file info and return the submission file list
                    return this.#listSubmissionDataFiles(params, result);
                })
                .catch(err => {
                    console.log(err);
                    throw new Error(ERROR.FAILED_LIST_DATA_FILES)
                });
        }
        
    }
    #ProcessSubmissionNodes(result, IDPropName=null) {
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

    async #listSubmissionDataFiles(params, listedObjects) {
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
        for (let file of listedObjects) {
            //don't retrieve logs
            if (file.Key.endsWith('/log'))
                break
            const file_name = file.Key.split('/').pop();
            

            let s3File = {
                submissionID: params.submissionID,
                nodeType: DATA_FILE,
                nodeID: file_name,
                status:  "Error",
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
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
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
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW]);
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }

        if (!await this.#isViewablePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        if (!NODE_RELATION_TYPES.includes(params.relationship)){
            throw new Error(ERROR.INVALID_NODE_RELATIONSHIP);
        }
        const result = await this.dataRecordService.RelatedNodes(params);
        return this.#ProcessSubmissionNodes(result[0], result[1]);
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
        var configString = this.uploaderCLIConfigs;
        //insert params values into the string
        configString = configString.format(parameters);
        //insert data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        //insert token into the string
        configString = await this.#replaceToken(context, configString);
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
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        //only the submitter of current submission can download the configuration file for data file uploading
        await verifyBatchPermission(this.userService, aSubmission, context.userInfo);

        // data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        const fileConfig = this.#getModelFileNodeInfo(aSubmission, latestDataModel);
        return {id_field: fileConfig["id-field"],
            name_field: fileConfig["name-field"],
            size_field: fileConfig["size-field"],
            md5_field: fileConfig["md5-field"],
            omit_DCF_prefix: fileConfig["omit-DCF-prefix"]};
    }

    /**
     * API: editSubmissionCollaborators
     * @param {*} params 
     * @param {*} context 
     * @returns 
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
        if (!aSubmission.studyID) {
            throw new Error(ERROR.INVALID_SUBMISSION_STUDY);
        }
        if (!aSubmission.collaborators) 
            aSubmission.collaborators = [];

        this.#verifySubmissionCreator(context?.userInfo, aSubmission);
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
                if (!this.#verifyStudyInUserStudies(user, aSubmission.studyID))
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
        const result = await this.submissionCollection.update( aSubmission);
        if (result?.modifiedCount === 1) {
            return aSubmission;
        }
        else
            throw new Error(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
    }

    #verifyStudyInUserStudies(user, studyId){
        if(!user?.studies || user.studies.length === 0 )
            return false;
        const userStudy = (user.studies[0] instanceof Object)? user.studies.find(s=>s._id === studyId || s._id === "All"):
            user.studies.find(s=> s === studyId || s === "All"); //backward compatible
        return (userStudy)? true: false;
    }

    #getModelFileNodeInfo(aSubmission, dataModelInfo){
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

    async #replaceToken(context, configString){
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

    async #getExistingDataFiles(fileNames, aSubmission) {
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

    async #getAllSubmissionDataFiles(bucketName, rootPath) {
        const AllDataFiles = await this.s3Service.listFileInDir(bucketName, `${rootPath}/${FILE}/`);
        return AllDataFiles
            ?.filter((f) => f.Key !== `${rootPath}/${FILE}/`)
            ?.map((f)=> f.Key.replace(`${rootPath}/${FILE}/`, ''));
    }

    async #deleteDataFiles(existingFiles, aSubmission) {
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
        var targetRetentionDate = new Date();
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
                    await this.#archiveSubmission(sub._id, sub.bucketName, sub.rootPath);
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

    async #archiveSubmission(submissionID, bucketName, rootPath) {
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
     * archiveCompletedSubmissions
     * description: overnight job to set inactive submission status to "Deleted", delete related data and files
     */
     async deleteInactiveSubmissions(){
        //get target inactive date, current date - config.inactive_submission_days (default 120 days)
        var targetInactiveDate = new Date();
        targetInactiveDate.setDate(targetInactiveDate.getDate() - this.emailParams.inactiveSubmissionDays - 1);
        const query = [{"$match": {"status": {"$in":[IN_PROGRESS, NEW, REJECTED, WITHDRAWN]}, "accessedAt": {"$exists": true, "$ne": null, "$lte": targetInactiveDate}}}];
        try {
            const inactiveSubs = await this.submissionCollection.aggregate(query);
            if (!inactiveSubs || inactiveSubs.length === 0) {
                console.debug("No inactive submission found.")
                return "No inactive submissions";
            }
            let failedDeleteSubs = []
            //delete related data and files
            for (const sub of inactiveSubs) {
                try {
                    const result = await this.s3Service.deleteDirectory(sub.bucketName, sub.rootPath);
                    if (result === true) {
                        await this.dataRecordService.deleteMetadataByFilter({"submissionID": sub._id});
                        await this.batchService.deleteBatchByFilter({"submissionID": sub._id});
                        await this.submissionCollection.updateOne({"_id": sub._id}, {"status" : DELETED, "updatedAt": new Date()});
                        console.debug(`Successfully deleted inactive submissions: ${sub._id}.`);
                    }
                } catch (e) {
                    console.error(`Failed to delete files under inactive submission: ${sub._id} with error: ${e.message}.`);
                    failedDeleteSubs.push(sub._id);
                }
            }
            return (failedDeleteSubs.length === 0 )? "successful!" : `Failed to delete files under submissions: ${failedDeleteSubs.toString()}.  please contact admin.`;
        }
        catch (e){
            console.error("Failed to delete inactive submission(s) with error:" + e.message);
            return "failed!";
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

        if (!await this.#isCreatePermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION)
        }

        if (params?.nodeType === VALIDATION.TYPES.DATA_FILE) {
            const existingFiles = await this.#getExistingDataFiles(params.nodeIDs, aSubmission);
            // note: file not existing in the s3 bucket should be deleted
            const notExistingFileNames = params.nodeIDs.filter(item => !existingFiles.has(item));
            await this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, notExistingFileNames);
            if (existingFiles.size === 0) {
                return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
            }
            const deletedFiles = await this.#deleteDataFiles(existingFiles, aSubmission);
            if (deletedFiles.length > 0) {
                // note: file deleted in s3 bucket should be deleted
                await this.qcResultsService.deleteQCResultBySubmissionID(aSubmission._id, VALIDATION.TYPES.DATA_FILE, deletedFiles);
                await this.#logDataRecord(context?.userInfo, aSubmission._id, VALIDATION.TYPES.DATA_FILE, deletedFiles);
                const submissionDataFiles = await this.#getAllSubmissionDataFiles(aSubmission?.bucketName, aSubmission?.rootPath);
                // note: reset fileValidationStatus if the number of data files changed. No data files exists if null
                const fileValidationStatus = submissionDataFiles.length > 0 ? VALIDATION_STATUS.NEW : null;
                await this.submissionCollection.updateOne({_id: aSubmission?._id}, {fileValidationStatus: fileValidationStatus, updatedAt: getCurrentTime()});
            }
            return ValidationHandler.success(`${deletedFiles.length} extra files deleted`)
        }

        const msg = {type: DELETE_METADATA, submissionID: params.submissionID, nodeType: params.nodeType, nodeIDs: params.nodeIDs}
        const success = await this.#requestDeleteDataRecords(msg, this.sqsLoaderQueue, params.submissionID, params.submissionID);
        const updated = await this.submissionCollection.updateOne({_id: aSubmission?._id}, {deletingData: Boolean(success?.success), updatedAt: getCurrentTime()});
        if (!updated?.modifiedCount || updated?.modifiedCount < 1) {
            console.error(ERROR.FAILED_UPDATE_DELETE_STATUS, aSubmission?._id);
            throw new Error(ERROR.FAILED_UPDATE_DELETE_STATUS);
        }

        if (Boolean(success?.success)) {
            await this.#logDataRecord(context?.userInfo, aSubmission._id, params.nodeType, params.nodeIDs);
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
        this.#verifySubmissionCreator(context?.userInfo, aSubmission);
        // find Collaborators with aSubmission.studyID
        return await this.userService.getCollaboratorsByStudyID(aSubmission.studyID, aSubmission.submitterID);
    }

    /**
     * API: get releases data
     * @param {*} params 
     * @param {*} context 
     * @returns {Promise<Object>}
     */
    async getReleasedNodeByIDs(params, context)
    {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        const {
            submissionID = submissionID,
            nodeType = nodeType,
            nodeID = nodeID,
            status = status
        } = params; // all three parameters are required in GraphQL API
        const results = await this.dataRecordService.getReleasedNode(submissionID, nodeType, nodeID, status);
        if(results && results.length > 0) 
        {
            const result = results[0];
            if(result?.props)
            {
                result.props = JSON.stringify(result.props);
            }
            return result;
        }
        else
        {
            return null;
        }
    }

    async verifySubmitter(submissionID, userInfo) {
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        this.#verifySubmissionCreator(userInfo, aSubmission);
    }
    // Only owned submission and create permission.
    #verifySubmissionCreator(userInfo, aSubmission) {
        if (!(userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE) &&
            aSubmission.submitterID === userInfo?._id)) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
    }

    async #logDataRecord(userInfo, submissionID, nodeType, nodeIDs) {
        const userName = `${userInfo?.lastName ? userInfo?.lastName + ',' : ''} ${userInfo?.firstName || NA}`;
        const logEvent = DeleteRecordEvent.create(userInfo._id, userInfo.email, userName, submissionID, nodeType, nodeIDs);
        await this.logCollection.insert(logEvent);
    }
    // TODO remove
    async #isValidPermission(userInfo, aSubmission) {
        const orgOwners = await this.userService.getOrgOwnerByOrgName(aSubmission?.organization?.name) || [];
        const isOrgOwners = orgOwners.some((aUser) => isPermittedUser(aUser, userInfo));
        const isSubmitter = aSubmission?.submitterID === userInfo?._id;
        const isDataCurator = ROLES.CURATOR === userInfo?.role && userInfo?.dataCommons.includes(aSubmission?.dataCommons);
        const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
        const isCollaborator = collaboratorUserIDs.includes(userInfo?._id);
        return this.userService.isAdmin(userInfo?.role) || isOrgOwners || isSubmitter || isDataCurator || isCollaborator;
    }

    async #requestDeleteDataRecords(message, queueName, deDuplicationId, submissionID) {
        try {
            await this.awsService.sendSQSMessage(message, deDuplicationId, deDuplicationId, queueName);
            return ValidationHandler.success();
        } catch (e) {
            console.error(ERRORS.FAILED_REQUEST_DELETE_RECORDS, `submissionID:${submissionID}`, `queue-name:${queueName}`, `error:${e}`);
            return ValidationHandler.handle(`queue-name: ${queueName}. ` + e);
        }
    }

    // private function
    async #updateValidationStatus(types, aSubmission, metaStatus, fileStatus, crossSubmissionStatus, updatedTime, validationRecord = null) {
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

    async #generateQCRecord(orphanedFiles, submissionID) {
        const qcResultErrors = await this.qcResultsService.getQCResultsErrors(submissionID, VALIDATION.TYPES.DATA_FILE);
        const qcResultFileNames = new Set(
            qcResultErrors
                .filter(qcResult => qcResult.dataRecordID === null)
                .map(qcResult => qcResult.submittedID)
        );
        return orphanedFiles
            .filter(fileName => !qcResultFileNames.has(fileName))
            .map(fileName => ({
                fileName,
                origin: SUBMISSION_STATS_ORIGIN_API,
                dataRecordID: null,
                error: {
                    severity: ERRORS.QC_RESULT.ERROR_TYPE.ERROR,
                    code: ERRORS.CODES.F008_MISSING_DATA_NODE_FILE,
                    title: ERROR.MISSING_DATA_NODE_FILE_TITLE,
                    desc: ERROR.MISSING_DATA_NODE_FILE_DESC
                }
            }));
    }

    #getModelVersion(dataModelInfo, dataCommonType) {
        const modelVersion = dataModelInfo?.[dataCommonType]?.["current-version"];
        if (modelVersion) {
            return modelVersion;
        }
        throw new Error(ERROR.INVALID_DATA_MODEL_VERSION);
    }

    async #recordSubmissionValidation(submissionID, validationRecord, dataTypes, submission) {
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
    #getEveryReminderQuery(remindSubmissionDay, status) {
        return remindSubmissionDay.reduce((acc, day) => {
            acc[`${INACTIVE_REMINDER}_${day}`] = status;
            return acc;
        }, {[`${FINAL_INACTIVE_REMINDER}`]: status});
    }

    #isCreatePermission(userInfo, aSubmission) {
        const isCreatePermission = (
            userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE) &&
            isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, aSubmission)
        );
        const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
        const isCollaborator = collaboratorUserIDs.includes(userInfo?._id);
        return isCreatePermission || isCollaborator;
    }

    #isValidAction(userInfo, aSubmission) {
        const isReviewPermission = (
            userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW) &&
            isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, aSubmission)
        );
        return this.#isCreatePermission || isReviewPermission;
    }

    #listConditions(userInfo, status, organizationID, submissionName, dbGaPID, dataCommonsParams, submitterName){
        const {_id, role, dataCommons, studies} = userInfo;
        const validSubmissionStatus = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
            REJECTED, WITHDRAWN, DELETED];

        const statusCondition = validSubmissionStatus.includes(status) && status !== ALL_FILTER ?
            { status: status } : { status: { $in: validSubmissionStatus } };
        const organizationCondition = organizationID && organizationID !== ALL_FILTER ?
            { "organization._id": organizationID } : {};

        const nameCondition = submissionName ? {name: { $regex: submissionName?.trim(), $options: "i" }} : {};
        const dbGaPIDCondition = dbGaPID ? {dbGaPID: { $regex: dbGaPID?.trim(), $options: "i" }} : {};
        const dataCommonsCondition = (dataCommonsParams && dataCommonsParams !== ALL_FILTER) ? {dataCommons: dataCommonsParams?.trim()} : {};
        const submitterNameCondition = (submitterName && submitterName !== ALL_FILTER) ? {submitterName: submitterName?.trim()} : {};

        const baseConditions = { ...statusCondition, ...organizationCondition, ...nameCondition,
            ...dbGaPIDCondition, ...dataCommonsCondition, ...submitterNameCondition };
        return (() => {
            switch (role) {
                case ROLES.ADMIN:
                    return baseConditions;
                case ROLES.FEDERAL_LEAD:
                    const userStudies = Array.isArray(studies) && studies.length > 0 ? studies : [];
                    const studyQuery = isAllStudy(userStudies) ? {} : {studyID: {$in: userStudies?.map((s)=> s?._id)}};
                    return {...baseConditions, ...studyQuery};
                case ROLES.DATA_COMMONS_PERSONNEL:
                    const aFilteredDataCommon = (dataCommonsParams && dataCommons?.includes(dataCommonsParams)) ? [dataCommonsParams] : []
                    return {...baseConditions, dataCommons: {$in: dataCommonsParams !== ALL_FILTER ? aFilteredDataCommon : dataCommons}};
                // Submitter or User role
                default:
                    return {...baseConditions, "$or": [
                        {"submitterID": _id},
                        {"collaborators.collaboratorID": _id, "collaborators.permission": {$in: [COLLABORATOR_PERMISSIONS.CAN_EDIT]}}]};
            }
        })();
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
 */
async function submissionActionNotification(userInfo, action, aSubmission, userService, organizationService, notificationService, emailParams) {
    switch(action) {
        case ACTIONS.SUBMIT:
            await sendEmails.submitSubmission(userInfo, aSubmission, userService, organizationService, notificationService);
            break;
        case ACTIONS.RELEASE:
            await sendEmails.releaseSubmission(emailParams, userInfo, aSubmission, userService, organizationService, notificationService);
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

const completeSubmissionEmailInfo = async (userInfo, aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await userService.getAdmin(),
        await userService.getUserByID(aSubmission?.submitterID),
        await userService.getPOCs(aSubmission?.dataCommons),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id),
        await userService.getFederalMonitors(aSubmission?.studyID),
        await userService.getCurators(aSubmission?.dataCommons)
    ];

    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const adminEmails = getUserEmails(results[1] || []);
    const POCEmails = getUserEmails(results[3] || []);
    const fedMonitorEmails = getUserEmails(results[5] || []);
    const aOrganization = results[4] || {};
    const curatorEmails = getUserEmails(results[6] || []);
    // CCs for POCs, org owner, admins, curators
    const ccEmails = new Set([...POCEmails, ...orgOwnerEmails, ...adminEmails, ...curatorEmails, ...fedMonitorEmails]).toArray();
    const aSubmitter = results[2];
    return [ccEmails, aSubmitter, aOrganization];
}

const releaseSubmissionEmailInfo = async (userInfo, aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await userService.getAdmin(),
        await userService.getUserByID(aSubmission?.submitterID),
        await userService.getPOCs(aSubmission?.dataCommons),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id),
        await userService.getFederalMonitors(aSubmission?.studyID),
        await userService.getCurators(aSubmission?.dataCommons)
    ];

    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const adminEmails = getUserEmails(results[1] || []);
    const submitterEmails = getUserEmails([results[2] || {}]);
    const fedMonitorEmails = getUserEmails(results[5] || []);
    // CCs for Submitter, org owner, admins, fed monitors
    const ccEmails = new Set([...submitterEmails, ...orgOwnerEmails, ...adminEmails, ...fedMonitorEmails]).toArray();
    const POCs = results[3] || [];
    const curators = results[6] || [];

    const toEmails = [...POCs, ...curators]
        ?.filter((aUser) => aUser?.email && aUser?.notifications?.includes(EN.DATA_SUBMISSION.RELEASE))
        ?.map((aUser)=> aUser.email);

    const aOrganization = results[4] || {};
    return [ccEmails, toEmails, aOrganization];
}

const inactiveSubmissionEmailInfo = async (aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id),
        await userService.getFederalMonitors(aSubmission?.studyID),
        await userService.getCurators(aSubmission?.dataCommons)
    ];
    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const fedMonitorEmails = getUserEmails(results[2] || []);
    const aOrganization = results[1] || {};
    const curatorEmails = getUserEmails(results[3] || []);
    const ccEmails = new Set([...orgOwnerEmails, ...fedMonitorEmails, ...curatorEmails]).toArray();
    return [ccEmails, aOrganization];
}

const cancelOrRejectSubmissionEmailInfo = async (aSubmission, userService, organizationService) => {
    const promises = [
        await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
        await organizationService.getOrganizationByID(aSubmission?.organization?._id),
        await userService.getAdmin(),
        await userService.getFederalMonitors(aSubmission?.studyID),
        await userService.getCurators(aSubmission?.dataCommons)
    ];
    const results = await Promise.all(promises);
    const orgOwnerEmails = getUserEmails(results[0] || []);
    const aOrganization = results[1] || {};
    const adminEmails = getUserEmails(results[2] || []);
    const fedMonitorEmails = getUserEmails(results[3] || []);
    const curatorEmails = getUserEmails(results[4] || []);
    const ccEmails = new Set([...orgOwnerEmails, ...curatorEmails, ...adminEmails, ...fedMonitorEmails]).toArray();
    return [ccEmails, aOrganization];
}

const sendEmails = {
    submitSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.SUBMIT)) {
            const promises = [
                await userService.getOrgOwner(aSubmission?.organization?._id),
                await organizationService.getOrganizationByID(aSubmitter?.organization?.orgID),
                await userService.getAdmin(),
                await userService.getFederalMonitors(aSubmission?.studyID),
                await userService.getCurators(aSubmission?.dataCommons)
            ];
            const results = await Promise.all(promises);
            const aOrganization = results[1] || {};

            const orgOwnerEmails = getUserEmails(results[0] || []);
            const adminEmails = getUserEmails(results[2] || []);
            const fedMonitorEmails = getUserEmails(results[3] || []);
            const curatorEmails = getUserEmails(results[4] || []);
            // CCs for org owner, Data Curator (or admins if not yet assigned exists)
            const ccEmailsVar = !aOrganization?.conciergeEmail ? adminEmails : curatorEmails;
            const ccEmails = new Set([...orgOwnerEmails, ...ccEmailsVar, ...fedMonitorEmails, ...curatorEmails]).toArray();
            await notificationService.submitDataSubmissionNotification(aSubmitter?.email, ccEmails, {
                    firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
                }, {
                    concierge: `${aSubmission?.conciergeName || 'NA'} via ${aSubmission?.conciergeEmail||'NA'}.`
                }
            );
        }
    },
    completeSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        const [ccEmails, aSubmitter, aOrganization] = await completeSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (!aSubmitter?.email) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.COMPLETE)) {
            await notificationsService.completeSubmissionNotification(aSubmitter?.email, ccEmails, {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                submissionName: aSubmission?.name,
                // only one study
                studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                conciergeName: aOrganization?.conciergeName || NA,
                conciergeEmail: aOrganization?.conciergeEmail || NA
            });
        }
    },
    cancelSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.CANCEL)) {
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
            });
        }
    },
    withdrawSubmission: async (userInfo, aSubmission, userService, organizationService, notificationsService) => {
        const aOrganization = await organizationService.getOrganizationByID(aSubmission?.organization?._id);
        const aCurator = await userService.getUserByID(aOrganization?.conciergeID);
        if (!aCurator) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER, `id=${aSubmission?._id}`);
            return;
        }

        if (aCurator?.notifications?.includes(EN.DATA_SUBMISSION.WITHDRAW)) {
            const promises = [
                await userService.getOrgOwnerByOrgName(aSubmission?.organization?.name),
                await userService.getUserByID(aSubmission?.submitterID),
                await userService.getFederalMonitors(aSubmission?.studyID),
                await userService.getCurators(aSubmission?.dataCommons)
            ];
            const results = await Promise.all(promises);
            const orgOwnerEmails = getUserEmails(results[0] || []);
            const submitterEmails = getUserEmails([results[1]] || []);
            const fedMonitorEmails = getUserEmails(results[2] || []);
            const curatorEmails = getUserEmails(results[3] || [])?.filter((i) => i !== aCurator?.email);

            const ccEmails = new Set([...orgOwnerEmails, ...submitterEmails, ...fedMonitorEmails, ...curatorEmails]).toArray();
            await notificationsService.withdrawSubmissionNotification(aCurator?.email, ccEmails, {
                firstName: `${aCurator.firstName} ${aCurator?.lastName || ''}`
            }, {
                submissionID: aSubmission?._id,
                submissionName: aSubmission?.name,
                // only one study
                studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                withdrawnByName: `${userInfo.firstName} ${userInfo?.lastName || ''}.`,
                withdrawnByEmail: `${userInfo?.email}`
            });
        }
    },
    releaseSubmission: async (emailParams, userInfo, aSubmission, userService, organizationService, notificationsService) => {
        const [ccEmails, toEmails, aOrganization] = await releaseSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (toEmails.length === 0) {
            return;
        }
        const additionalInfo = [
            [SUBMISSION_ID, aSubmission?._id],
            [DATA_SUBMISSION_TYPE, aSubmission?.intention],
            [DESTINATION_LOCATION, `${aSubmission?.bucketName} at ${aSubmission?.rootPath}`]];
        await notificationsService.releaseDataSubmissionNotification(toEmails, ccEmails, {
            firstName: `${aSubmission?.dataCommons} team`,
            additionalInfo: additionalInfo
        },{
            dataCommonName: aSubmission?.dataCommons
        }, {
            submissionName: aSubmission?.name,
            // only one study
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            techSupportEmail: emailParams.techSupportEmail || NA
        })
    },
    rejectSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REJECT)) {
            const [ccEmails, aOrganization] = await cancelOrRejectSubmissionEmailInfo(aSubmission, userService, organizationService);
            await notificationService.rejectSubmissionNotification(aSubmitter?.email, ccEmails, {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                submissionID: aSubmission?._id,
                submissionName: aSubmission?.name,
                conciergeEmail: aOrganization?.conciergeEmail || NA,
                conciergeName: aOrganization?.conciergeName || NA
            });
        }
    },
    remindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService, expiredDays, pastDays) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REMIND_EXPIRE)) {
            const [ccEmails, aOrganization] = await inactiveSubmissionEmailInfo(aSubmission, userService, organizationService);
            await notificationService.inactiveSubmissionNotification(aSubmitter?.email, ccEmails, {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                title: aSubmission?.name,
                expiredDays: expiredDays || NA,
                studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                pastDays: pastDays || NA,
                url: emailParams.url || NA
            });
        }
    },
    finalRemindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }

        if (aSubmitter?.notifications?.includes(EN.DATA_SUBMISSION.REMIND_EXPIRE)) {
            const [ccEmails, aOrganization] = await inactiveSubmissionEmailInfo(aSubmission, userService, organizationService);
            await notificationService.finalInactiveSubmissionNotification(aSubmitter?.email, ccEmails, {
                firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
            }, {
                title: aSubmission?.name,
                studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
                days: emailParams.finalRemindSubmissionDay || NA,
                url: emailParams.url || NA
            });
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
            // TODO rework for the shared function for the all studies
            const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
            return isAllStudy(studies) ? true : Boolean(studies?.find((s) => s?._id === aSubmission.studyID));
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

// only one study name
const getSubmissionStudyName = (studies, aSubmission) => {
    const studyNames = studies
        ?.filter((aStudy) => aStudy?._id === aSubmission?.studyID)
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


const verifyBatchPermission= async(userService, aSubmission, userInfo) => {
    // verify submission owner
    if (!aSubmission) {
        throw new Error(ERROR.SUBMISSION_NOT_EXIST);
    }
    const collaborativeUsers =  await userService.getCollaboratorsByStudyID(aSubmission.studyID, aSubmission.submitterID);
    const collaborativeUserIDs = collaborativeUsers.map(u => u._id);
    const isCreatePermission = (
        (userInfo?.permissions.includes(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE) &&
            isUserScope(userInfo?._id, userInfo?.role, userInfo?.studies, userInfo?.dataCommons, aSubmission)) ||
        // Collaborator
        collaborativeUserIDs.includes(userInfo?._id)
    );

    if (!isCreatePermission) {
        throw new Error(ERROR.INVALID_BATCH_PERMISSION);
    }
}
// TODO remove
const isPermittedUser = (aTargetUser, userInfo) => {
    return aTargetUser?.email === userInfo.email && aTargetUser?.IDP === userInfo.IDP
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
    if (!validStatus.has(params.status)) {
        throw new Error(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER);
    }
}
// TODO remove
const isSubmissionPermitted = (aSubmission, userInfo) => {
    const userRole = userInfo?.role;
    const allSubmissionRoles = [USER.ROLES.ADMIN, USER.ROLES.FEDERAL_LEAD, USER.ROLES.FEDERAL_MONITOR];
    const isOrgOwner = userRole === USER.ROLES.ORG_OWNER && userInfo?.organization?.orgID === aSubmission?.organization?._id;
    const isSubmitter = userRole === USER.ROLES.SUBMITTER && userInfo?._id === aSubmission?.submitterID;
    const isPOC = userRole === USER.ROLES.DC_POC && userInfo?.dataCommons.includes(aSubmission?.dataCommons);
    const isCurator = userRole === USER.ROLES.CURATOR && userInfo?.dataCommons.includes(aSubmission?.dataCommons);
    const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getViewableCollaboratorIDs();
    const isCollaborator = collaboratorUserIDs.includes(userInfo?._id);

    if (allSubmissionRoles.includes(userRole) || isOrgOwner || isSubmitter || isPOC || isCurator || isCollaborator) {
        return;
    }
    throw new Error(ERROR.INVALID_STATS_SUBMISSION_PERMISSION);
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
    #SUBMISSIONS = "submissions";
    constructor(name, userInfo, dataCommons, studyID, dbGaPID, aProgram, modelVersion, intention, dataType, approvedStudy, submissionBucketName) {
        this._id = v4();
        this.name = name;
        this.submitterID = userInfo._id;
        this.collaborators = [];
        this.submitterName = formatName(userInfo);
        this.dataCommons = dataCommons;
        this.modelVersion = modelVersion;
        this.studyID = studyID;
        this.dbGaPID = dbGaPID;
        this.status = NEW;
        this.history = [HistoryEventBuilder.createEvent(userInfo._id, NEW, null)];
        this.organization = {
            _id: (aProgram && aProgram?._id) ? aProgram?._id : null,
            name: (aProgram && aProgram?.name) ? aProgram?.name : null
        };
        this.bucketName = submissionBucketName;
        this.rootPath = `${this.#SUBMISSIONS}/${this._id}`;
        this.conciergeName = this.#getConciergeName(approvedStudy, aProgram);
        this.conciergeEmail = this.#getConciergeEmail(approvedStudy, aProgram);
        this.createdAt = this.updatedAt = getCurrentTime();
        // no metadata to be validated
        this.metadataValidationStatus = this.fileValidationStatus = this.crossSubmissionStatus = null;
        this.fileErrors = [];
        this.fileWarnings = [];
        this.intention = intention;
        this.dataType = dataType;
        this.studyAbbreviation = approvedStudy?.studyAbbreviation
        if (!isUndefined(approvedStudy?.controlledAccess)) {
            this.controlledAccess = approvedStudy.controlledAccess;
        }
        this.ORCID = approvedStudy?.ORCID || null;
        this.accessedAt = getCurrentTime();
    }

    static createSubmission(name, userInfo, dataCommons, studyID, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName) {
        return new DataSubmission(name, userInfo, dataCommons, studyID, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy, aOrganization, submissionBucketName);
    }

    #getConciergeName(approvedStudy, aProgram){
        if (approvedStudy?.primaryContact) {
            return approvedStudy.primaryContact.firstName + " " + approvedStudy.primaryContact.lastName;
        } else if (aProgram) {
            return aProgram?.conciergeName;
        } else {
            return null;
        }
    }
    #getConciergeEmail(approvedStudy, aProgram){
        if (approvedStudy?.primaryContact) {
            return approvedStudy.primaryContact.email;
        } else if (aProgram) {
            return aProgram?.conciergeEmail;
        } else {
            return null;
        }
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
    // TODO remove
    getViewableCollaboratorIDs() {
        return this.#getViewableCollaborators(this.collaborators)
            .map(i => i?.collaboratorID) || [];
    }

    getEditableCollaboratorIDs() {
        return this.#getEditableCollaborators(this.collaborators)
            .map(i => i?.collaboratorID) || [];
    }
    // TODO remove
    #getViewableCollaborators(collaborators) {
        return collaborators
    }

    #getEditableCollaborators(collaborators) {
        return collaborators
            .filter(i => i?.permission === COLLABORATOR_PERMISSIONS.CAN_EDIT);
    }
}

module.exports = {
    Submission
};

