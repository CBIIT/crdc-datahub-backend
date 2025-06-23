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
    _actionName;
    _permissions;
    _fromStatus;
    _toStatus;
    constructor(actionName, permissions, fromStatus, toStatus){
        this._actionName = actionName;
        this._permissions = permissions;
        this._fromStatus = fromStatus;
        this._toStatus = toStatus;
    }

    getNewStatus() {
        return this._toStatus;
    }

    getPrevStatus() {
        return this._fromStatus;
    }


    isValidSubmitAction(isAdminAction, aSubmission, comment, submissionAttributes) {
        if (this._actionName === ACTIONS.SUBMIT) {
            if (submissionAttributes.isValidationNotPassed()) {
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
            return this._actionName === ACTIONS.SUBMIT && isAdminAction && isError && (!comment || comment?.trim()?.length === 0);
    }

    async isValidPermissions(action, userInfo, collaboratorUserIDs = [], authorizationCallback) {
        const collaboratorCondition = [ACTIONS.SUBMIT, ACTIONS.WITHDRAW, ACTIONS.CANCEL].includes(action) && collaboratorUserIDs.includes(userInfo?._id);

        const multiUserScopes = await Promise.all(
            this._permissions.map(aPermission => authorizationCallback(userInfo, aPermission))
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
