const ERROR = require("../constants/error-constants");
const {API_TOKEN} = require("../constants/application-constants");
const {decodeToken} = require("./token-verifier");

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

}

function verifyApiToken(context, token_secret){
    const token = context[API_TOKEN];
    if(!token) {
        throw new Error(ERROR.INVALID_TOKEN_EMPTY);
    }
    //extract userInfo in the token
    const userInfo = decodeToken(token, token_secret);
    if(!userInfo) {
        throw new Error(ERROR.INVALID_TOKEN_NO_USER);
    }

    if(!userInfo._id){
        throw new Error(ERROR.INVALID_TOKEN_NO_USER_ID);
    }
    return userInfo;
}

async function verifySubmitter(userInfo, submissionID, submissions, userService){
    if (!submissionID) {
        throw new Error(ERROR.INVALID_SUBMISSION_EMPTY);
    }
    const submission = await submissions.find(submissionID);
    if (!submission || submission.length == 0) {
        throw new Error(`${ERROR.INVALID_SUBMISSION_NOT_FOUND}, ${submissionID}!`);
    }
    //3. verify if user is submitter or organization owner
    if(userInfo._id != submission[0].submitterID) {
        const org = submission[0].organization;
        const orgName = (typeof org == "string")? org: org.name;
        //check if the user is org owner of submitter
        const orgOwners = await userService.getOrgOwnerByOrgName(orgName);
        if(!orgOwners || orgOwners.length == 0) {
            throw new Error(`${ERROR.INVALID_SUBMITTER}, ${submissionID}!`);
        }
        const matchedOwner = orgOwners.filter(o => o._id == userInfo._id );
        if(!matchedOwner || matchedOwner.length == 0){
            throw new Error(`${ERROR.INVALID_SUBMITTER}, ${submissionID}!`);
        }
    }
    return submission[0];
}
module.exports = {
    verifySession,
    verifyApiToken,
    verifySubmitter
};
