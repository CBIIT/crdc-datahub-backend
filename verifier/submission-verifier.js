const ERROR = require("../constants/error-constants");
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
    REJECTED, WITHDRAWN, ACTIONS } = require("../constants/submission-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;

function verifySubmissionAction(submissionId, action){ 

    return new SubmissionActionVerifier(submissionId, action);
}

class SubmissionActionVerifier {
    constructor(submissionId, action){
        if(!submissionId) throw Error(ERROR.VERIFY.INVALID_SUBMISSION_ID);
        this.submissionId = submissionId;
        if(!action) throw Error("action is required!");
        this.action = action;
    }

    async exists(submissionCollection){
        const submission = await submissionCollection.find(this.submissionId);
        if (!submission || submission.length === 0) {
            throw new Error(`${ERROR.INVALID_SUBMISSION_NOT_FOUND}, ${this.submissionId }!`);
        }
        this.submission = submission[0];
        return this.submission;
    }

    isValidAction(){
        if(this.action === ACTIONS.REJECT)
            this.action = `${this.action}_${this.submission.status}`;

        let actionMap = submissionActionMap?.filter((a)=>a.action === this.action);
        if(!actionMap || actionMap.length === 0)
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION} ${this.action}!`);

        this.actionMap = actionMap[0];
        const fromStatus = this.submission.status;
        if(this.actionMap.fromStatus.indexOf(fromStatus) < 0)
            throw new Error(`${ERROR.VERIFY.INVALID_SUBMISSION_ACTION_STATUS} ${this.action}!`);
        this.newStatus = this.actionMap.toStatus;
    }

    inRoles(userInfo){
        const role = userInfo?.role;
        if(this.actionMap.roles.indexOf(role) < 0)
            throw new Error(`Invalid user role for the action: ${this.action}!`);
        return this.newStatus;
    }
}

//actions: NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, RESUME
const submissionActionMap = [
    {action:ACTIONS.SUBMIT, fromStatus: [IN_PROGRESS, WITHDRAWN],
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.CURATOR,ROLES.ADMIN], toStatus:SUBMITTED},
    {action:ACTIONS.RELEASE, fromStatus: [SUBMITTED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:RELEASED},
    {action:ACTIONS.WITHDRAW, fromStatus: [SUBMITTED], 
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER,], toStatus:WITHDRAWN},
    {action:ACTIONS.REJECT_SUBMIT, fromStatus: [SUBMITTED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:REJECTED},
    {action:ACTIONS.REJECT_RELEASE, fromStatus: [RELEASED], 
        roles: [ROLES.ADMIN, ROLES.DC_POC], toStatus:REJECTED},
    {action:ACTIONS.COMPLETE, fromStatus: [RELEASED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN, ROLES.DC_POC], toStatus:COMPLETED},
    {action:ACTIONS.CANCEL, fromStatus: [NEW,IN_PROGRESS], 
        roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER, ROLES.CURATOR,ROLES.ADMIN], toStatus:CANCELED},
    {action:ACTIONS.ARCHIVE, fromStatus: [COMPLETED], 
        roles: [ROLES.CURATOR,ROLES.ADMIN], toStatus:ARCHIVED},
    {action:ACTIONS.RESUME, fromStatus: [REJECTED], 
            roles: [ROLES.SUBMITTER, ROLES.ORG_OWNER], toStatus:IN_PROGRESS},
];

module.exports = {
    verifySubmissionAction
};
