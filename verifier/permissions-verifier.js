const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;

function verifyValidationResultsReadPermissions(userInfo, submission) {
    // User information
    const userID = userInfo?._id;
    const userRole = userInfo?.role;
    const userOrgID = userInfo?.organization?.orgID;
    const userDataCommons = userInfo?.dataCommons;
    // Submission information
    const submitterID = submission?.submitterID;
    const submissionDataCommons = submission?.dataCommons;
    const submissionOrgID = submission?.organization?._id;
    const submissionCollaborators = submission?.collaborators || [];
    // Roles with unconditional access
    if ([ROLES.ADMIN, ROLES.FEDERAL_LEAD, ROLES.CURATOR].includes(userRole)){
        return true;
    }
    // Check if the user is an organization owner and the user and submission have the same organization
    if (userRole === ROLES.ORG_OWNER && userOrgID === submissionOrgID){
        return true;
    }
    // Check if the user is a submitter and if they created the submission
    if (userRole === ROLES.SUBMITTER && userID === submitterID){
        return true;
    }
    // Check if the user is a data commons point of contact or curator and if the submission is for one of the user's
    // data commons
    if ([ROLES.DC_POC, ROLES.CURATOR].includes(userRole) && userDataCommons.includes(submissionDataCommons)){
        return true;
    }
    // Check if the user is a collaborator for the submission
    for (const collaborator of submissionCollaborators){
        const collaboratorID = collaborator?.collaboratorID;
        if (!!collaboratorID && collaboratorID === userID){
            return true;
        }
    }
    return false;
}

module.exports = {
    verifyValidationResultsReadPermissions
}