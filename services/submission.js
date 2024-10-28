const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION, VALIDATION_STATUS, EXPORT, INTENTION, DATA_TYPE, DELETED, DATA_FILE,
    CONSTRAINTS, COLLABORATOR_PERMISSIONS
} = require("../constants/submission-constants");
const {v4} = require('uuid')
const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifySession, verifySubmitter} = require("../verifier/user-info-verifier");
const {verifySubmissionAction} = require("../verifier/submission-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {formatName} = require("../utility/format-name");
const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {SubmissionActionEvent, DeleteRecordEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {AWSService} = require("../services/aws-request");
// const {write2file} = require("../utility/io-util") //keep the line for future testing.

const ROLES = USER_CONSTANTS.USER.ROLES;
const ALL_FILTER = "All";
const NA = "NA"
const config = require("../config");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {isUndefined, replaceErrorString} = require("../utility/string-util");
const {NODE_RELATION_TYPES} = require("./data-record-service");
const {QCResult, QCResultError} = require("../domain/qc-result");
const {verifyToken} = require("../verifier/token-verifier");
const {verifyValidationResultsReadPermissions} = require("../verifier/permissions-verifier");
const FILE = "file";

const UPLOAD_TYPES = ['file','metadata'];
const LOG_DIR = 'logs';
const LOG_FILE_EXT_ZIP ='.zip';
const LOG_FILE_EXT_LOG ='.log';
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
// Set to array
Set.prototype.toArray = function() {
    return Array.from(this);
};

class Submission {
    constructor(logCollection, submissionCollection, batchService, userService, organizationService, notificationService, dataRecordService, tier, fetchDataModelInfo, awsService, metadataQueueName, s3Service, emailParams, dataCommonsList, hiddenDataCommonsList, validationCollection, sqsLoaderQueue, releaseService) {
        this.logCollection = logCollection;
        this.submissionCollection = submissionCollection;
        this.batchService = batchService;
        this.userService = userService;
        this.organizationService = organizationService;
        this.notificationService = notificationService;
        this.dataRecordService = dataRecordService;
        this.tier = tier;
        this.fetchDataModelInfo = fetchDataModelInfo;
        this.awsService = awsService;
        this.metadataQueueName = metadataQueueName;
        this.s3Service = s3Service;
        this.emailParams = emailParams;
        this.allowedDataCommons = new Set(dataCommonsList);
        this.hiddenDataCommons = new Set(hiddenDataCommonsList);
        this.validationCollection = validationCollection;
        this.sqsLoaderQueue = sqsLoaderQueue;
        this.releaseService = releaseService;
    }

    async createSubmission(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyOrganization()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER]);
        const intention = [INTENTION.UPDATE, INTENTION.DELETE].find((i) => i.toLowerCase() === params?.intention.toLowerCase());
        const dataType = [DATA_TYPE.METADATA_AND_DATA_FILES, DATA_TYPE.METADATA_ONLY].find((i) => i.toLowerCase() === params?.dataType.toLowerCase());
        validateCreateSubmissionParams(params, this.allowedDataCommons, this.hiddenDataCommons, intention, dataType, context?.userInfo);

        const aUserOrganization= await this.organizationService.getOrganizationByName(context.userInfo?.organization?.orgName);
        const approvedStudy = aUserOrganization.studies.find((study) => study?._id === params.studyID);
        if (!approvedStudy) {
            throw new Error(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
        }
        if (approvedStudy.controlledAccess && !params.dbGaPID?.trim()?.length) {
            throw new Error(ERROR.MISSING_CREATE_SUBMISSION_DBGAPID);
        }
        const latestDataModel = await this.fetchDataModelInfo();
        const modelVersion = this.#getModelVersion(latestDataModel, params.dataCommons);
        const newSubmission = DataSubmission.createSubmission(
            params.name, context.userInfo, params.dataCommons, params.studyID, params.dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy);
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

        const filterConditions = [
            // default filter for listing submissions
            this.#listConditions(context?.userInfo, params.status, params.organization, params.name, params.dbGaPID, params.dataCommons, params?.submitterName),
            // no filter for dataCommons aggregation
            this.#listConditions(context?.userInfo, ALL_FILTER, ALL_FILTER, null, null, ALL_FILTER, ALL_FILTER),
            // note: Aggregation of Submitter name should not be filtered by a submitterName
            this.#listConditions(context?.userInfo, params?.status, params.organization, params.name, params.dbGaPID, params.dataCommons, ALL_FILTER),
        ]

        const [listConditions, dataCommonsCondition, submitterNameCondition] = filterConditions;
        const pipeline = [{"$match": listConditions}];
        if (params.orderBy) {
            pipeline.push({"$sort": { [params.orderBy]: getSortDirection(params.sortDirection) } });
        }

        const pagination = [];
        if (params.offset) pagination.push({"$skip": params.offset});
        const disablePagination = Number.isInteger(params.first) && params.first === -1;
        if (!disablePagination) {
            pagination.push({"$limit": params.first});
        }
        const promises = [
            await this.submissionCollection.aggregate((!disablePagination) ? pipeline.concat(pagination) : pipeline),
            await this.submissionCollection.aggregate(pipeline.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            await this.submissionCollection.distinct("dataCommons", dataCommonsCondition),
            // note: Submitter name filter is omitted
            await this.submissionCollection.distinct("submitterName", submitterNameCondition)
        ];
        
        return await Promise.all(promises).then(function(results) {
            return {
                submissions: results[0] || [],
                total: results[1]?.length > 0 ? results[1][0]?.count : 0,
                dataCommons: results[2] || [],
                submitterNames: results[3] || []
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
            .verifyRole([USER.ROLES.ADMIN, USER.ROLES.DC_POC, USER.ROLES.CURATOR, USER.ROLES.FEDERAL_LEAD, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER, USER.ROLES.FEDERAL_MONITOR]);
        const aSubmission = await findByID(this.submissionCollection,params?.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        if (!this.#isViewablePermission(context, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        params.collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getViewableCollaboratorIDs();

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }
        return this.batchService.listBatches(params, context);
    }

  async getSubmission(params, context){
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);
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
        if (this.#isViewablePermission(context, aSubmission)) {
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

    #isViewablePermission(context, aSubmission) {
        const collaboratorIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getViewableCollaboratorIDs();
        const conditionCollaborator = collaboratorIDs.includes(context?.userInfo?._id);
        const conditionDCPOC = (context?.userInfo?.role === ROLES.DC_POC) && (context?.userInfo?.dataCommons.includes(aSubmission?.dataCommons));
        const conditionCurator = (context?.userInfo?.role === ROLES.CURATOR) && (context?.userInfo?.dataCommons.includes(aSubmission?.dataCommons));
        const conditionORGOwner = (context?.userInfo?.role === ROLES.ORG_OWNER) && (context?.userInfo?.organization?.orgID === aSubmission?.organization?._id);
        const conditionSubmitter = (context?.userInfo?.role === ROLES.SUBMITTER) && (context?.userInfo?._id === aSubmission?.submitterID);
        const conditionAdmin = [ROLES.FEDERAL_LEAD, ROLES.ADMIN, USER.ROLES.FEDERAL_MONITOR].includes(context?.userInfo?.role);
        return conditionDCPOC || conditionCurator || conditionORGOwner || conditionSubmitter || conditionAdmin || conditionCollaborator;
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
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);
        const userInfo = context.userInfo;
        const submissionID = params?.submissionID;
        const action = params?.action;
        //verify submission action
        const verifier = verifySubmissionAction(submissionID, action);
        //verify if a submission can be find by submissionID.
        let submission = await verifier.exists(this.submissionCollection);
        if (!await this.#isValidPermission(userInfo, submission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        let fromStatus = submission.status;
        //verify if the action is valid based on current submission status
        verifier.isValidAction(params?.comment);
        //verify if user's role is valid for the action
        const newStatus = verifier.inRoles(userInfo, submission);
        verifier.isValidSubmitAction(userInfo?.role, submission, params?.comment);
        await this.#isValidReleaseAction(action, submission?._id, submission?.studyID, submission?.crossSubmissionStatus);
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
            completePromise.push(this.#sendCompleteMessage({type: COMPLETE_SUBMISSION, submissionID}, submissionID));
        }
        if (action === ACTIONS.RELEASE) {
            completePromise.push(this.#sendCompleteMessage({type: GENERATE_DCF_MANIFEST, submissionID}, submissionID));
        }

        //log event and send notification
        const logEvent = SubmissionActionEvent.create(userInfo._id, userInfo.email, userInfo.IDP, submission._id, action, fromStatus, newStatus);
        await Promise.all([
            this.logCollection.insert(logEvent),
            submissionActionNotification(userInfo, action, submission, this.userService, this.organizationService, this.notificationService, this.emailParams, this.tier),
            this.#cleanUpSubmission(action, submissionID, submission?.bucketName, submission?.rootPath)
        ].concat(completePromise));
        return submission;
    }

    async #cleanUpSubmission(action, submissionID, bucketName, rootPath) {
        if (action === ACTIONS.CANCEL) {
            const deleteS3Files = await this.s3Service.deleteDirectory(bucketName, rootPath);
            if (deleteS3Files) {
                await this.dataRecordService.deleteDataRecordsBySubmissionID(submissionID);
                await this.releaseService.deleteReleaseBySubmissionID(submissionID);
            }
        }
    }

    async remindInactiveSubmission() {
        // The system sends an email reminder a day before the data submission expires
        const finalInactiveSubmissions = await this.#getInactiveSubmissions(this.emailParams.finalRemindSubmissionDay - 1, FINAL_INACTIVE_REMINDER)
        if (finalInactiveSubmissions?.length > 0) {
            await Promise.all(finalInactiveSubmissions.map(async (aSubmission) => {
                await sendEmails.finalRemindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService, this.tier);
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
                        await sendEmails.remindInactiveSubmission(this.emailParams, aSubmission, this.userService, this.organizationService, this.notificationService, expiredDays, pastDays, this.tier);
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
            .verifyInitialized();
        const aSubmission = await findByID(this.submissionCollection, params?._id);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }
        isSubmissionPermitted(aSubmission, context?.userInfo);
        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }
        const [orphanedFiles, submissionStats] = await this.dataRecordService.submissionStats(aSubmission);

        const fileErrors = orphanedFiles?.map((fileName) => {
            const errorMsg = QCResultError.create(
                ERROR.MISSING_DATA_NODE_FILE_TITLE,
                replaceErrorString(ERROR.MISSING_DATA_NODE_FILE_DESC, `'${fileName}'`)
            );
            return QCResult.create(VALIDATION.TYPES.DATA_FILE, VALIDATION.TYPES.DATA_FILE, fileName, null, null, VALIDATION_STATUS.ERROR, getCurrentTime(), getCurrentTime(), [errorMsg], []);
        });

        const aSubmissionErrors = aSubmission.fileErrors
            .filter((f)=> f && f.type === VALIDATION.TYPES.DATA_FILE && f.severity === VALIDATION_STATUS.ERROR)
            .map((study)=> study.submittedID);

        if (JSON.stringify(aSubmissionErrors) !== JSON.stringify(orphanedFiles)) {
            await this.submissionCollection.update({_id: aSubmission?._id, fileErrors, updatedAt: getCurrentTime()});
        }
        return submissionStats;
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
     * @param {*} bucket as object {} contains submission ID
     * @param {*} rootPath
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
        if (!await this.#isValidPermission(context?.userInfo, aSubmission)) {
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
            (userInfo.role === ROLES.CURATOR && userInfo?.dataCommons.includes(aSubmission?.dataCommons)) || isCollaborator)
        if (!isPermitted) {
            throw new Error(ERROR.INVALID_EXPORT_METADATA);
        }
        if (aSubmission.status !== SUBMITTED) {
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${EXPORT}!`);
        }
        return await this.dataRecordService.exportMetadata(params._id);
    }
    
    async submissionQCResults(params, context) {
        // Check if the submission exists
        const submission = await findByID(this.submissionCollection, params._id);
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        // Check if the user has permission to read this data
        const userInfo = context.userInfo;
        if (!verifyValidationResultsReadPermissions(userInfo, submission)) {
            // A different error message is required if a Federal Monitor is unauthorized
            if (userInfo.role === ROLES.FEDERAL_MONITOR){
                throw new Error(ERROR.INVALID_ROLE_STUDY);
            }
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }
        return this.dataRecordService.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async submissionCrossValidationResults(params, context){
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.CURATOR, ROLES.FEDERAL_MONITOR])

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
        }
        return this.dataRecordService.submissionCrossValidationResults(params.submissionID, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }

    async listSubmissionNodeTypes(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);
        const submissionID = params?._id;
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        if (!this.#isViewablePermission(context, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        const userInfo = context.userInfo;
        if (!verifyValidationResultsReadPermissions(userInfo, aSubmission)) {
            // A different error message is required if a Federal Monitor is unauthorized
            if (userInfo.role === ROLES.FEDERAL_MONITOR){
                throw new Error(ERROR.INVALID_ROLE_STUDY);
            }
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
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
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);
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

        if (!this.#isViewablePermission(context, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
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
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);

        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        if (!this.#isViewablePermission(context, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

         // if user role is Federal Monitor, only can access his studies.
         if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
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
            .verifyRole([ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.DC_POC, ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }

        if (!this.#isViewablePermission(context, aSubmission)) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        // if user role is Federal Monitor, only can access his studies.
        if (context?.userInfo?.role === ROLES.FEDERAL_MONITOR && (!context?.userInfo?.studies || !context?.userInfo?.studies.includes(aSubmission?.studyID))) {
            throw new Error(ERROR.INVALID_ROLE_STUDY);
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
        var configString = config.uploaderCLIConfigs;
        //insert params values into the string
        configString = configString.format(parameters);
        //insert data model file node properties into the string
        const latestDataModel = await this.fetchDataModelInfo();
        configString = this.#replaceFileNodeProps(aSubmission, configString, latestDataModel);
        //insert token into the string
        configString = await this.#replaceToken(context, configString);
        /** test code: write yaml string to file for verification of output **/
        // write2file(configString, "logs/userUploaderConfig.yaml")
        /** end test code **/
        return configString;
    }

    /**
     * API: editSubmissionCollaborators
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async editSubmissionCollaborators(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ ROLES.ORG_OWNER, ROLES.SUBMITTER]);
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
                //check if the collaborator has the study
                const organization = await findByID(this.organizationService.organizationCollection, user.organization.orgID);
                if (!organization || organization?.studies.length === 0) {
                    throw new Error(ERROR.INVALID_COLLABORATOR_STUDY);
                }
                const collaborator_study = organization.studies.find(s => s._id ===  aSubmission.studyID);
                if (!collaborator_study)
                {
                    throw new Error(ERROR.INVALID_COLLABORATOR_STUDY);
                }
                // validate collaborator permission
                if (!Object.values(COLLABORATOR_PERMISSIONS).includes(collaborator.permission)) {
                    throw new Error(ERROR.INVALID_COLLABORATOR_PERMISSION);
                }
            }
            collaborator.collaboratorName = user.lastName + "," + user.firstName ;
            collaborator.Organization = user.organization;
        }
        // if passed validation
        aSubmission.collaborators = collaborators;  
        aSubmission.updatedAt = new Date(); 
        const result = await this.submissionCollection.update( aSubmission);
        if (result?.modifiedCount === 1) {
            return aSubmission
        }
        else
            throw new Error(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
    }

    #replaceFileNodeProps(aSubmission, configString, dataModelInfo){
        const modelFileNodeInfos = Object.values(dataModelInfo?.[aSubmission.dataCommons]?.[DATA_MODEL_SEMANTICS]?.[DATA_MODEL_FILE_NODES]);
        const omit_DCF_prefix = dataModelInfo?.[aSubmission.dataCommons]?.['omit-DCF-prefix'];
        if (modelFileNodeInfos.length > 0){
            let modelFileNodeInfo = modelFileNodeInfos[0];
            modelFileNodeInfo['omit-DCF-prefix'] = (!omit_DCF_prefix)?false:omit_DCF_prefix;
            return configString.format(modelFileNodeInfo);
        }
        else{
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
        var target_retention_date = new Date();
        target_retention_date.setDate(target_retention_date.getDate() - config.completed_submission_days);
        const query = [{"$match": {"status": COMPLETED, "updatedAt": { "$lte": target_retention_date}}}];
        try {
            const archive_subs = await this.submissionCollection.aggregate(query);
            if (!archive_subs || archive_subs.length === 0) {
                console.debug("No completed submissions need to be archived.")
                return "No completed submissions need to be archived";
            }
           
            let failed_delete_subs = []
            //archive related data and delete files in s3
            for (const sub of archive_subs) {
                try {
                    const result = await this.s3Service.deleteDirectory(sub.bucketName, sub.rootPath);
                    if (result === true) {
                        await this.dataRecordService.archiveMetadataByFilter({"submissionID": sub._id});
                        await this.batchService.deleteBatchByFilter({"submissionID": sub._id});
                        await this.submissionCollection.updateOne({"_id": sub._id}, {"archived": true, "updatedAt": new Date()});
                        console.debug(`Successfully archive completed submissions: ${sub._id}.`);
                    }
                } catch (e) {
                    console.error(`Failed to delete files under archived completed submission: ${sub._id} with error: ${e.message}.`);
                    failed_delete_subs.push(sub._id);
                }
            }
            return (failed_delete_subs.length === 0 )? "successful!" : `Failed to delete files archived completed submission submissions: ${failed_delete_subs.toString()}.  please contact admin.`;
        }
        catch (e){
            console.error("Failed to archive completed submission(s) with error:" + e.message);
            return "failed!";
        }
    }

     /**
     * archiveCompletedSubmissions
     * description: overnight job to set inactive submission status to "Deleted", delete related data and files
     */
     async deleteInactiveSubmissions(){
        //get target inactive date, current date - config.inactive_submission_days (default 120 days)
        var target_inactive_date = new Date();
        target_inactive_date.setDate(target_inactive_date.getDate() - config.inactive_submission_days - 1);
        const query = [{"$match": {"status": {"$in":[IN_PROGRESS, NEW, REJECTED, WITHDRAWN]}, "accessedAt": {"$exists": true, "$ne": null, "$lte": target_inactive_date}}}];
        try {
            const inactive_subs = await this.submissionCollection.aggregate(query);
            if (!inactive_subs || inactive_subs.length === 0) {
                console.debug("No inactive submission found.")
                return "No inactive submissions";
            }
            let failed_delete_subs = []
            //delete related data and files
            for (const sub of inactive_subs) {
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
                    failed_delete_subs.push(sub._id);
                }
            }
            return (failed_delete_subs.length === 0 )? "successful!" : `Failed to delete files under submissions: ${failed_delete_subs.toString()}.  please contact admin.`;
        }
        catch (e){
            console.error("Failed to delete inactive submission(s) with error:" + e.message);
            return "failed!";
        }
    }


    async deleteDataRecords(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.ORG_OWNER, ROLES.CURATOR, ROLES.SUBMITTER]);
        const aSubmission = await findByID(this.submissionCollection, params.submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        if (!await this.#isValidPermission(context?.userInfo, aSubmission)) {
            throw new Error(ERROR.INVALID_DELETE_DATA_RECORDS_PERMISSION)
        }

        if (params?.nodeType === VALIDATION.TYPES.DATA_FILE) {
            const existingFiles = await this.#getExistingDataFiles(params.nodeIDs, aSubmission);
            if (existingFiles.size === 0) {
                return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
            }
            const deletedFiles = await this.#deleteDataFiles(existingFiles, aSubmission);
            if (deletedFiles.length > 0) {
                await this.#logDataRecord(context?.userInfo, aSubmission._id, VALIDATION.TYPES.DATA_FILE, deletedFiles);
            }
            // note: reset metadataValidationStatus if no data files found
            const submissionDataFiles = await this.#getAllSubmissionDataFiles(aSubmission?.bucketName, aSubmission?.rootPath);
            if (submissionDataFiles?.length === 0) {
                await this.submissionCollection.updateOne({_id: aSubmission?._id}, {fileValidationStatus: null, metadataValidationStatus: null, updatedAt: getCurrentTime()});
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
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN, ROLES.CURATOR, ROLES.ORG_OWNER, ROLES.SUBMITTER]);

        const aSubmission = await findByID(this.submissionCollection, params?.submissionID);
        if(!aSubmission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND)
        }
        const organizationIDs = await this.organizationService.findByStudyID(aSubmission?.studyID);
        const users = await this.userService.getUsersByOrganizationIDs(organizationIDs);
        return users
            .filter(u=> u._id !== aSubmission?.submitterID && u.role === ROLES.SUBMITTER);
    }

    async verifySubmitter(submissionID, context) {
        const aSubmission = await findByID(this.submissionCollection, submissionID);
        if (!aSubmission) {
            throw new Error(ERROR.SUBMISSION_NOT_EXIST);
        }

        const userInfo = context?.userInfo;
        const orgOwners = await this.userService.getOrgOwnerByOrgName(aSubmission?.organization?.name) || [];
        const isOrgOwners = orgOwners.some((aUser) => isPermittedUser(aUser, userInfo));
        const isSubmitter = aSubmission?.submitterID === userInfo?._id;
        const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
        const isCollaborator = collaboratorUserIDs.includes(userInfo?._id);

        const isPermitted = isOrgOwners || isSubmitter || isCollaborator;
        if (!isPermitted) {
            throw new Error(`${ERROR.INVALID_SUBMITTER}, ${submissionID}!`)
        }
    }

    async #logDataRecord(userInfo, submissionID, nodeType, nodeIDs) {
        const userName = `${userInfo?.lastName ? userInfo?.lastName + ',' : ''} ${userInfo?.firstName || NA}`;
        const logEvent = DeleteRecordEvent.create(userInfo._id, userInfo.email, userName, submissionID, nodeType, nodeIDs);
        await this.logCollection.insert(logEvent);
    }

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

    #listConditions(userInfo, status, organizationID, submissionName, dbGaPID, dataCommonsParams, submitterName){
        const {_id, role, dataCommons, organization, studies} = userInfo;
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
                case ROLES.FEDERAL_LEAD:
                    // List all submissions
                    return baseConditions;
                case ROLES.CURATOR:
                case ROLES.DC_POC:
                    return {...baseConditions, dataCommons: {$in: dataCommons}};
                case ROLES.ORG_OWNER:
                    if (organization?.orgName) {
                        return {...baseConditions, "organization.name": organization.orgName};
                    }
                    return baseConditions;
                case ROLES.FEDERAL_MONITOR:
                    return {...baseConditions, studyID: {$in: studies || []}};
                default:
                    return {...baseConditions, "$or": [
                        {"submitterID": _id},
                        {"collaborators.collaboratorID": _id, "collaborators.permission": {$in: [COLLABORATOR_PERMISSIONS.CAN_EDIT, COLLABORATOR_PERMISSIONS.CAN_VIEW]}}]};
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
 * @param {*} tier
 */
async function submissionActionNotification(userInfo, action, aSubmission, userService, organizationService, notificationService, emailParams, tier) {
    switch(action) {
        case ACTIONS.SUBMIT:
            await sendEmails.submitSubmission(userInfo, aSubmission, userService, organizationService, notificationService, tier);
            break;
        case ACTIONS.RELEASE:
            await sendEmails.releaseSubmission(emailParams, userInfo, aSubmission, userService, organizationService, notificationService, tier);
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
    const toEmails = getUserEmails([...POCs, ...curators] || []);
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
    submitSubmission: async (userInfo, aSubmission, userService, organizationService, notificationService, tier) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);

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
        }, tier);
    },
    releaseSubmission: async (emailParams, userInfo, aSubmission, userService, organizationService, notificationsService, tier) => {
        const [ccEmails, toEmails, aOrganization] = await releaseSubmissionEmailInfo(userInfo, aSubmission, userService, organizationService);
        if (toEmails.length === 0) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
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
        }, tier)
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
    remindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService, expiredDays, pastDays, tier) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await inactiveSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationService.inactiveSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
        }, {
            title: aSubmission?.name,
            expiredDays: expiredDays || NA,
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            pastDays: pastDays || NA,
            url: emailParams.url || NA
        }, tier);
    },
    finalRemindInactiveSubmission: async (emailParams, aSubmission, userService, organizationService, notificationService, tier) => {
        const aSubmitter = await userService.getUserByID(aSubmission?.submitterID);
        if (!aSubmitter) {
            console.error(ERROR.NO_SUBMISSION_RECEIVER + `id=${aSubmission?._id}`);
            return;
        }
        const [ccEmails, aOrganization] = await inactiveSubmissionEmailInfo(aSubmission, userService, organizationService);
        await notificationService.finalInactiveSubmissionNotification(aSubmitter?.email, ccEmails, {
            firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`
        }, {
            title: aSubmission?.name,
            studyName: getSubmissionStudyName(aOrganization?.studies, aSubmission),
            days: emailParams.finalRemindSubmissionDay || NA,
            url: emailParams.url || NA
        }, tier);
    }
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
    const isSubmitter = aSubmission?.submitterID === userInfo?._id;
    const collaboratorUserIDs = Collaborators.createCollaborators(aSubmission?.collaborators).getEditableCollaboratorIDs();
    const isCollaborator = collaboratorUserIDs.includes(userInfo?._id);
    if (isSubmitter || isCollaborator) {
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

function validateCreateSubmissionParams (params, allowedDataCommons, hiddenDataCommons, intention, dataType, userInfo) {
    if (!params.name || params?.name?.trim().length === 0 || !params.studyID || !params.dataCommons) {
        throw new Error(ERROR.CREATE_SUBMISSION_INVALID_PARAMS);
    }
    if (params?.name?.length > CONSTRAINTS.NAME_MAX_LENGTH) {
        throw new Error(replaceErrorString(ERROR.CREATE_SUBMISSION_INVALID_NAME, `${CONSTRAINTS.NAME_MAX_LENGTH}`));
    }
    if (hiddenDataCommons.has(params.dataCommons) || !allowedDataCommons.has(params.dataCommons)) {
        throw new Error(replaceErrorString(ERROR.CREATE_SUBMISSION_INVALID_DATA_COMMONS, `'${params.dataCommons}'`));
    }

    if (!userInfo.organization) {
        throw new Error(ERROR.CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED);
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
    constructor(name, userInfo, dataCommons, studyID, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy) {
        this._id = v4();
        this.name = name;
        this.submitterID = userInfo._id;
        this.collaborators = [];
        this.submitterName = formatName(userInfo);
        this.organization = {
            _id: userInfo?.organization?.orgID,
            name: userInfo?.organization?.orgName
        };
        this.dataCommons = dataCommons;
        this.modelVersion = modelVersion;
        this.studyID = studyID;
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
        this.dataType = dataType;
        this.studyAbbreviation = approvedStudy?.studyAbbreviation
        if (!isUndefined(approvedStudy?.controlledAccess)) {
            this.controlledAccess = approvedStudy.controlledAccess;
        }
        this.ORCID = approvedStudy?.ORCID || null;
        this.accessedAt = getCurrentTime();
    }

    static createSubmission(name, userInfo, dataCommons, studyID, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy) {
        return new DataSubmission(name, userInfo, dataCommons, studyID, dbGaPID, aUserOrganization, modelVersion, intention, dataType, approvedStudy);
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

    getViewableCollaboratorIDs() {
        return this.#getViewableCollaborators(this.collaborators)
            .map(i => i?.collaboratorID) || [];
    }

    getEditableCollaboratorIDs() {
        return this.#getEditableCollaborators(this.collaborators)
            .map(i => i?.collaboratorID) || [];
    }

    #getViewableCollaborators(collaborators) {
        return collaborators
            .filter(i => i?.permission === COLLABORATOR_PERMISSIONS.CAN_EDIT || i?.permission === COLLABORATOR_PERMISSIONS.CAN_VIEW);
    }

    #getEditableCollaborators(collaborators) {
        return collaborators
            .filter(i => i?.permission === COLLABORATOR_PERMISSIONS.CAN_EDIT);
    }
}

module.exports = {
    Submission
};

