const ERROR = require("../constants/error-constants");
const {toPascalCase} = require("../utility/string-util")

function verifySubmissionAction(submissionId, action){ 

    return new SubmissionActionVerifier(submissionId, action);
}

class SubmissionActionVerifier {
    constructor(submissionId, action){
        if(!submissionId) throw Error("submissionID is required!");
        this.submissionId = submissionId;
        if(!action) throw Error("action is required!");
        this.action = action;
    }

    async exists(submissionCollection){
        const submission = await submissionCollection.find(this.submissionId);
        if (!submission || submission.length == 0) {
            throw new Error(`${ERROR.INVALID_SUBMISSION_NOT_FOUND}, ${this.submissionId }!`);
        }
        this.submission = submission[0];
        return this.submission;
    }

    isValidAction(actionMaps){
        let actionMap = actionMaps?.filter((a)=>a.action === toPascalCase(this.action));
        if(!actionMap || actionMap.length === 0)
            throw new Error(`Invalid submission action: ${this.action}!`);

        this.actionMap = actionMap[0];
        const fromStatus = this.submission.status;
        if(this.actionMap.fromStatus.indexOf(fromStatus) < 0)
            throw new Error(`Invalid submission status for the action: ${this.action}!`);
        this.newStatus = this.actionMap.toStatus;
    }

    inRoles(userInfo){
        const role = userInfo?.role;
        if(this.actionMap.roles.indexOf(role) < 0)
            throw new Error(`Invalid user role for the action: ${this.action}!`);
        return this.newStatus;
    }
}

module.exports = {
    verifySubmissionAction
};
