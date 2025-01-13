const ERROR = require("../constants/error-constants");
const {ORGANIZATION} = require("../crdc-datahub-database-drivers/constants/organization-constants");

function verifySession(context){
    return new UserInfoVerifier(context);
}

class UserInfoVerifier {

    constructor(context) {
        const userInfo = context?.userInfo;
        if (!userInfo) throw new Error(ERROR.NOT_LOGGED_IN);
        this.userInfo = userInfo;
    }

    verifyInitialized(){
        if (!this?.userInfo?._id) throw new Error(ERROR.SESSION_NOT_INITIALIZED);
        return this;
    }

    verifyRole(roles) {
        if (!roles.includes(this?.userInfo?.role)) throw new Error(ERROR.INVALID_ROLE);
        return this;
    }

    verifyOrganization() {
        if (!this?.userInfo?.organization?.status || this?.userInfo?.organization?.status === ORGANIZATION.STATUSES.INACTIVE) {
            throw new Error(ERROR.VERIFY.INVALID_ORGANIZATION_STATUS);
        }
        return this;
    }

    verifyPermission(permission) {
        if (permission instanceof String) permission = [permission];
        if (!this?.userInfo?.permissions?.some(item => permission.includes(item))) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return this;
    }
}

async function verifySubmitter(userInfo, submissionID, submissions, userService){
    if (!submissionID) {
        throw new Error(ERROR.INVALID_SUBMISSION_EMPTY);
    }
    const result = await submissions.find(submissionID);
    if (!result || result.length === 0) {
        throw new Error(`${ERROR.INVALID_SUBMISSION_NOT_FOUND}, ${submissionID}!`);
    }
    const submission = result[0]
    //3. verify if user is submitter or organization owner
    if(userInfo._id !== submission.submitterID) {
        const org = submission.organization;
        const orgName = (typeof org == "string")? org: org.name;
        //check if the user is org owner of submitter
        const orgOwners = await userService.getOrgOwnerByOrgName(orgName);
        if(!orgOwners || orgOwners.length === 0) {
            throw new Error(`${ERROR.INVALID_SUBMITTER}, ${submissionID}!`);
        }
        const matchedOwner = orgOwners.filter(o => o._id === userInfo._id );
        if(!matchedOwner || matchedOwner.length === 0){
            throw new Error(`${ERROR.INVALID_SUBMITTER}, ${submissionID}!`);
        }
    }
    //4. verify submission rootPath
    if(!submission.rootPath)
        throw new Error(`${ERROR.VERIFY.EMPTY_ROOT_PATH}, ${submissionID}!`);

    return submission;
}
module.exports = {
    verifySession,
    verifySubmitter
};
