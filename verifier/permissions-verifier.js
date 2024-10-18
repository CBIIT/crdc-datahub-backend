function verifyReadPermissions(userInfo, submission) {
    // User information
    const userID = userInfo._id;
    const userRole = userInfo?.role;
    const userOrgID = userInfo?.organization?.orgID;
    const userDataCommons = userInfo?.dataCommons;
    // Submission information
    const submitterID = submission?.submitterID;
    const submissionDataCommons = submission?.dataCommons;
    const submissionOrgID = submission?.organization?._id;
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
    for (const collaborator in submission.collaborators){
        const collaboratorID = collaborator?.collaboratorID;
        if (!!collaboratorID && collaboratorID === userInfo._id){
            return true;
        }
    }
    return false;
}

module.exports = {
    verifyReadPermissions
}