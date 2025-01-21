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


    isValidSubmitAction(isAdminAction, aSubmission, comment) {
        if(this.#actionName === ACTIONS.SUBMIT) {
            const isInvalidAdminStatus = !this.#isValidAdminStatus(isAdminAction, aSubmission);
            const validStatus = [VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING];
            // if deleted intention, allow it to be submitted without any data files. Ignore any value if meta-data only data file
            const ignoreFileValidationStatus = aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
            const isValidatedStatus = aSubmission?.intention === INTENTION.DELETE || (validStatus.includes(aSubmission?.metadataValidationStatus)
                && (ignoreFileValidationStatus || validStatus.includes(aSubmission?.fileValidationStatus)));

            if (isInvalidAdminStatus) {
                if (isAdminAction ||(!isAdminAction && (!isValidatedStatus))) {
                    throw new Error(ERROR.VERIFY.INVALID_SUBMIT_ACTION);
                }
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

    isValidPermissions(action, userID, userPermissions = [], collaboratorUserIDs = []) {
        const collaboratorCondition = [ACTIONS.SUBMIT, ACTIONS.WITHDRAW, ACTIONS.COMPLETE].includes(action) && collaboratorUserIDs.includes(userID);
        const test = userPermissions?.some(item => this.#permissions.includes(item));
        return userPermissions?.some(item => this.#permissions.includes(item)) || collaboratorCondition;
    }

    // Private Function
    #isValidAdminStatus(isAdminSubmitAction, aSubmission) {
        const isMetadataInvalid = aSubmission?.metadataValidationStatus === VALIDATION_STATUS.NEW;
        const isFileInValid = aSubmission?.fileValidationStatus === VALIDATION_STATUS.NEW;
        const isDeleteIntention = aSubmission?.intention === INTENTION.DELETE;
        const ignoreFileValidationStatus = aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
        // if deleted intention, allow it to be submitted without any data files, if metadata only, any value is ignored for fileValidationStatus
        const isDataFileValidated = isDeleteIntention || !isMetadataInvalid && (ignoreFileValidationStatus || (aSubmission?.fileValidationStatus === null || !isFileInValid));
        // null fileValidationStatus means this submission doesn't have any files uploaded
        return isAdminSubmitAction && isDataFileValidated;
    }
}

const submissionActionMap = [
    {action:ACTIONS.SUBMIT, fromStatus: [IN_PROGRESS, WITHDRAWN, REJECTED], toStatus:SUBMITTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.ADMIN_SUBMIT]},
    {action:ACTIONS.RELEASE, fromStatus: [SUBMITTED], toStatus:RELEASED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW]},
    {action:ACTIONS.WITHDRAW, fromStatus: [SUBMITTED], toStatus:WITHDRAWN, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE]},
    {action:ACTIONS.REJECT_SUBMIT, fromStatus: [SUBMITTED], toStatus:REJECTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    // TODO submitted statues check
    {action:ACTIONS.REJECT_RELEASE, fromStatus: [RELEASED], toStatus:REJECTED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    // TODO Complete, Reject (after released) double check if the release status before reject
    {action:ACTIONS.COMPLETE, fromStatus: [RELEASED], toStatus:COMPLETED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CONFIRM]},
    {action:ACTIONS.CANCEL, fromStatus: [NEW,IN_PROGRESS, REJECTED], toStatus:CANCELED, permissions: [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE]},
    {action:ACTIONS.ARCHIVE, fromStatus: [COMPLETED], toStatus:ARCHIVED, permissions: []},
    {action:ACTIONS.RESUME, fromStatus: [REJECTED], toStatus:IN_PROGRESS, permissions: []},
];

module.exports = {
    verifySubmissionAction
};
