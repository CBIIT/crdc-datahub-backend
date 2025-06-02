const ERROR = require("../constants/error-constants");
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION_STATUS, INTENTION, DATA_TYPE
} = require("../constants/submission-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");

function verifySubmissionAction(action, submissionStatus, comment){
    if (action === ACTIONS.REJECT) {
        if(!comment || comment?.trim()?.length === 0) {
            throw new Error(ERROR.VERIFY.REJECT_ACTION_COMMENT_REQUIRED);
        }
        const submittedStatues = submissionActionMap
            .filter((s) => (s.action === ACTIONS.REJECT_SUBMIT))
            .map((s) => s.fromStatus)[0];

        const releasedStatues = submissionActionMap
            .filter((s) => (s.action === ACTIONS.REJECT_RELEASE))
            .map((s) => s.fromStatus)[0];

        if (!(submissionStatus === RELEASED && releasedStatues.includes(submissionStatus)) &&
            !(submissionStatus === SUBMITTED && submittedStatues.includes(submissionStatus))) {
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${action}!`);
        }
    }

    const newName = action === ACTIONS.REJECT ? `${action}_${submissionStatus}` : action;
    const actionMap = submissionActionMap?.filter((a)=>a.action === newName);
    if (!actionMap || actionMap.length === 0)
        throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION} Action: ${action}`);

    const {permissions, fromStatus, toStatus} = actionMap[0];
    if (fromStatus.indexOf(submissionStatus) < 0) {
        throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${action}!`);
    }
    return new SubmissionActionVerifier(newName, permissions, submissionStatus, toStatus);
}

class SubmissionActionVerifier {
    // Private variable
    #actionName;
    #permissions;
    #fromStatus;
    #toStatus;
    constructor(actionName, permissions, fromStatus, toStatus){
        this.#actionName = actionName;
        this.#permissions = permissions;
        this.#fromStatus = fromStatus;
        this.#toStatus = toStatus;
    }

    getNewStatus() {
        return this.#toStatus;
    }

    getPrevStatus() {
        return this.#fromStatus;
    }


    isValidSubmitAction(isAdminAction, aSubmission, comment, dataFileSize, hasOrphanedFiles, hasUploadingBatch) {
        if (this.#actionName === ACTIONS.SUBMIT) {
            const validationStatuses = [VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING];
            // 1. The metadataValidationStatus and fileValidationStatus should not be Validating.
            const validationRunning = aSubmission.metadataValidationStatus === VALIDATION_STATUS.VALIDATING;

            // 2. The dataFileSize.size property should be greater than 0 for submissions with the data type Metadata and Data Files.; ignore if metadata only && delete intention
            const ignoreDataFileValidation = aSubmission?.intention === INTENTION.DELETE || aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
            const isValidDataFileSize = ignoreDataFileValidation || (aSubmission?.dataType === DATA_TYPE.METADATA_AND_DATA_FILES && dataFileSize > 0);

            // 3. The metadataValidationStatus and fileValidationStatus should not be New
            const isValidValidationNotNew = aSubmission?.metadataValidationStatus !== VALIDATION_STATUS.NEW && aSubmission?.fileValidationStatus !== VALIDATION_STATUS.NEW;

            // Admin can skip the requirement; The metadataValidationStatus and fileValidationStatus should not be Error.
            const hasValidationErrors = aSubmission?.metadataValidationStatus === VALIDATION_STATUS.ERROR || aSubmission?.fileValidationStatus === VALIDATION_STATUS.ERROR;
            const ignoreErrorValidation = isAdminAction && hasValidationErrors;
            // 4. Metadata validation should be initialized for submissions with the intention Delete.
            const isValidDeleteIntention = aSubmission?.intention === INTENTION.UPDATE || (aSubmission?.intention === INTENTION.DELETE && validationStatuses.includes(aSubmission?.metadataValidationStatus));

            const isValidStatus =
                // 5. Metadata validation should be initialized for submissions with the intention Delete / the data type Metadata Only.
                (aSubmission?.dataType === DATA_TYPE.METADATA_ONLY &&
                    (ignoreErrorValidation || validationStatuses.includes(aSubmission?.metadataValidationStatus))) ||
                // 6. Metadata validation should be initialized for submissions with the data type Metadata and Data Files.
                (aSubmission?.dataType === DATA_TYPE.METADATA_AND_DATA_FILES &&
                    (ignoreErrorValidation || (validationStatuses.includes(aSubmission?.metadataValidationStatus) && validationStatuses.includes(aSubmission?.fileValidationStatus))));

            const isInvalidSubmit = validationRunning || hasUploadingBatch || !isValidDeleteIntention ||
                !isValidStatus || !isValidDataFileSize || !isValidValidationNotNew || hasOrphanedFiles

            if (isInvalidSubmit) {
                console.error(ERROR.VERIFY.INVALID_SUBMIT_ACTION, `SubmissionID:${aSubmission?._id}`);
                throw new Error(ERROR.VERIFY.INVALID_SUBMIT_ACTION);
            }

            if ([INTENTION.UPDATE].includes(aSubmission?.intention) && this.isSubmitActionCommentRequired(aSubmission, isAdminAction, comment)) {
                throw new Error(ERROR.VERIFY.SUBMIT_ACTION_COMMENT_REQUIRED);
            }
        }
    }

    isSubmitActionCommentRequired(aSubmission, isAdminAction, comment) {
            const isError = [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus].includes(VALIDATION_STATUS.ERROR);
            return this.#actionName === ACTIONS.SUBMIT && isAdminAction && isError && (!comment || comment?.trim()?.length === 0);
    }

    async isValidPermissions(action, userInfo, collaboratorUserIDs = [], authorizationCallback) {
        const collaboratorCondition = [ACTIONS.SUBMIT, ACTIONS.WITHDRAW, ACTIONS.CANCEL].includes(action) && collaboratorUserIDs.includes(userInfo?._id);

        const multiUserScopes = await Promise.all(
            this.#permissions.map(aPermission => authorizationCallback(userInfo, aPermission))
        );

        const isNotPermitted = multiUserScopes?.every(userScope => userScope.isNoneScope());
        return !isNotPermitted || collaboratorCondition;
    }
}

const submissionActionMap = [
    {action:ACTIONS.SUBMIT, fromStatus: [IN_PROGRESS, WITHDRAWN, REJECTED], toStatus:SUBMITTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.ADMIN_SUBMIT]},
    {action:ACTIONS.RELEASE, fromStatus: [SUBMITTED], toStatus:RELEASED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW]},
    {action:ACTIONS.WITHDRAW, fromStatus: [SUBMITTED], toStatus:WITHDRAWN, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE]},
    {action:ACTIONS.REJECT_SUBMIT, fromStatus: [SUBMITTED], toStatus:REJECTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    {action:ACTIONS.REJECT_RELEASE, fromStatus: [RELEASED], toStatus:REJECTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    {action:ACTIONS.COMPLETE, fromStatus: [RELEASED], toStatus:COMPLETED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    {action:ACTIONS.CANCEL, fromStatus: [NEW,IN_PROGRESS, REJECTED], toStatus:CANCELED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CANCEL]},
    {action:ACTIONS.ARCHIVE, fromStatus: [COMPLETED], toStatus:ARCHIVED, permissions: []},
    {action:ACTIONS.RESUME, fromStatus: [REJECTED], toStatus:IN_PROGRESS, permissions: []},
];

module.exports = {
    verifySubmissionAction
};
