const ERROR = require("../constants/error-constants");
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS, VALIDATION_STATUS, INTENTION, DATA_TYPE
} = require("../constants/submission-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;

function verifySubmissionAction(action, submissionStatus, comment){
    if (action === ACTIONS.REJECT) {
        if(!comment || comment?.trim()?.length === 0) {
            throw new Error(ERROR.VERIFY.REJECT_ACTION_COMMENT_REQUIRED);
        }
    }

    const actionMap = submissionActionMap?.filter((a)=>a.action === action);
    if(!actionMap || actionMap.length === 0)
        throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION} Action: ${action}`);

    const {actionName, fromStatus, toStatus} = actionMap[0];
    if (fromStatus.indexOf(submissionStatus) < 0) {
        throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${action}!`);
    }
    return new SubmissionActionVerifier(actionName, fromStatus, toStatus);
}

class SubmissionActionVerifier {
    constructor(actionName, fromStatus, toStatus){
        this.actionName = actionName === ACTIONS.REJECT ? `${actionName}_${fromStatus}` : actionName;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
    }

    getNewStatus(){
        return this.toStatus;
    }

    isValidSubmitAction(role, aSubmission, comment) {
        if(this.actionName === ACTIONS.SUBMIT) {
            const isInvalidAdminStatus = !this.#isValidAdminStatus(role, aSubmission);
            const validStatus = [VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING];
            // if deleted intention, allow it to be submitted without any data files. Ignore any value if meta-data only data file
            const ignoreFileValidationStatus = aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
            const isValidatedStatus = aSubmission?.intention === INTENTION.DELETE || (validStatus.includes(aSubmission?.metadataValidationStatus)
                && (ignoreFileValidationStatus || validStatus.includes(aSubmission?.fileValidationStatus)));

            if (isInvalidAdminStatus) {
                if (ROLES.ADMIN === role ||(![ROLES.ADMIN].includes(role) && (!isValidatedStatus))) {
                    throw new Error(ERROR.VERIFY.INVALID_SUBMIT_ACTION);
                }
            }

            if ([INTENTION.UPDATE].includes(aSubmission?.intention) && this.isSubmitActionCommentRequired(aSubmission, role, comment)) {
                throw new Error(ERROR.VERIFY.SUBMIT_ACTION_COMMENT_REQUIRED);
            }
        }
    }

    isSubmitActionCommentRequired(aSubmission, role, comment) {
            const isError = [aSubmission?.metadataValidationStatus, aSubmission?.fileValidationStatus].includes(VALIDATION_STATUS.ERROR);
            return this.actionName === ACTIONS.SUBMIT && ROLES.ADMIN === role && isError && (!comment || comment?.trim()?.length === 0);
    }

    // Private Function
    #isValidAdminStatus(role, aSubmission) {
        const isRoleAdmin = role === USER.ROLES.ADMIN;
        const isMetadataInvalid = aSubmission?.metadataValidationStatus === VALIDATION_STATUS.NEW;
        const isFileInValid = aSubmission?.fileValidationStatus === VALIDATION_STATUS.NEW;
        const isDeleteIntention = aSubmission?.intention === INTENTION.DELETE;
        const ignoreFileValidationStatus = aSubmission?.dataType === DATA_TYPE.METADATA_ONLY;
        // if deleted intention, allow it to be submitted without any data files, if metadata only, any value is ignored for fileValidationStatus
        const isDataFileValidated = isDeleteIntention || !isMetadataInvalid && (ignoreFileValidationStatus || (aSubmission?.fileValidationStatus === null || !isFileInValid));
        // null fileValidationStatus means this submission doesn't have any files uploaded
        return isRoleAdmin && isDataFileValidated;
    }
}

const submissionActionMap = [
    {action:ACTIONS.SUBMIT, fromStatus: [IN_PROGRESS, WITHDRAWN, REJECTED], toStatus:SUBMITTED},
    {action:ACTIONS.RELEASE, fromStatus: [SUBMITTED], toStatus:RELEASED},
    {action:ACTIONS.WITHDRAW, fromStatus: [SUBMITTED], toStatus:WITHDRAWN},
    {action:ACTIONS.REJECT_SUBMIT, fromStatus: [SUBMITTED], toStatus:REJECTED},
    {action:ACTIONS.REJECT_RELEASE, fromStatus: [RELEASED], toStatus:REJECTED},
    {action:ACTIONS.COMPLETE, fromStatus: [RELEASED], toStatus:COMPLETED},
    {action:ACTIONS.CANCEL, fromStatus: [NEW,IN_PROGRESS, REJECTED], toStatus:CANCELED},
    {action:ACTIONS.ARCHIVE, fromStatus: [COMPLETED], toStatus:ARCHIVED},
    {action:ACTIONS.RESUME, fromStatus: [REJECTED], toStatus:IN_PROGRESS},
];

module.exports = {
    verifySubmissionAction
};
