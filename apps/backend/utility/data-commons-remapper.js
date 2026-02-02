const DISPLAY_NAMES_MAP = require("../constants/data-commons-display-names-map");


function getDataCommonsDisplayName(datacommons){
    let displayName;
    if (typeof datacommons !== "string") {
        datacommons = null;
    }
    displayName = DISPLAY_NAMES_MAP[datacommons];
    return displayName || datacommons;
}

function genericGetDataCommonsDisplayNames(inputObject, nextFunction){
    if (!inputObject || typeof nextFunction !== "function"){
        return null;
    }
    if (inputObject instanceof Array){
        inputObject = inputObject.map((value) => nextFunction(value));
    }
    else {
        inputObject = nextFunction(inputObject);
    }
    return inputObject;
}

function getDataCommonsDisplayNamesForSubmission(submission){
    if (!submission){
        return null;
    }
    if (submission.dataCommons){
        submission.dataCommonsDisplayName = genericGetDataCommonsDisplayNames(submission.dataCommons, getDataCommonsDisplayName);
    }
    return submission;
}

function getDataCommonsDisplayNamesForListSubmissions(listSubmissions){
    if (!listSubmissions){
        return null;
    }
    if (listSubmissions.submissions){
        listSubmissions.submissions = genericGetDataCommonsDisplayNames(listSubmissions.submissions, getDataCommonsDisplayNamesForSubmission);
    }
    if (listSubmissions.dataCommons){
        listSubmissions.dataCommonsDisplayNames = genericGetDataCommonsDisplayNames(listSubmissions.dataCommons, getDataCommonsDisplayName);
    }
    return listSubmissions;
}

function getDataCommonsDisplayNamesForUser(user){
    if (!user){
        return null;
    }
    if (user.dataCommons){
        user.dataCommonsDisplayNames = genericGetDataCommonsDisplayNames(user.dataCommons, getDataCommonsDisplayName);
    }
    if (user.studies){
        user.studies = genericGetDataCommonsDisplayNames(user.studies, getDataCommonsDisplayNamesForApprovedStudy)
    }
    return user;
}

function getDataCommonsDisplayNamesForApprovedStudy(approvedStudy){
    if (!approvedStudy){
        return null;
    }
    if (approvedStudy.programs){
        approvedStudy.programs = genericGetDataCommonsDisplayNames(approvedStudy.programs, getDataCommonsDisplayNamesForUserOrganization);
    }
    if (approvedStudy.primaryContact){
        approvedStudy.primaryContact = genericGetDataCommonsDisplayNames(approvedStudy.primaryContact, getDataCommonsDisplayNamesForUser);
    }
    return approvedStudy;
}

function getDataCommonsDisplayNamesForApprovedStudyList(approvedStudyList){
    if (!approvedStudyList){
        return null;
    }
    if (approvedStudyList.studies){
        approvedStudyList.studies = genericGetDataCommonsDisplayNames(approvedStudyList.studies, getDataCommonsDisplayNamesForApprovedStudy);
    }
    return approvedStudyList;
}

function getDataCommonsDisplayNamesForUserOrganization(userOrganization){
    if (!userOrganization){
        return null;
    }
    if (userOrganization.studies){
        userOrganization.studies = genericGetDataCommonsDisplayNames(userOrganization.studies, getDataCommonsDisplayNamesForApprovedStudy);
    }
    return userOrganization;
}

function getDataCommonsDisplayNamesForReleasedNode(releasedNode){
    if (!releasedNode){
        return null;
    }
    if (releasedNode.dataCommons){
        releasedNode.dataCommonsDisplayNames = genericGetDataCommonsDisplayNames(releasedNode.dataCommons, getDataCommonsDisplayName);
    }
    return releasedNode;
}

function getDataCommonsOrigin(displayDataCommon) {
    if (!displayDataCommon){
        return null;
    }
    return Object.keys(DISPLAY_NAMES_MAP).find(key => DISPLAY_NAMES_MAP[key] === displayDataCommon);
}

module.exports = {
    getDataCommonsOrigin,
    getDataCommonsDisplayName,
    genericGetDataCommonsDisplayNames,
    getDataCommonsDisplayNamesForSubmission,
    getDataCommonsDisplayNamesForListSubmissions,
    getDataCommonsDisplayNamesForUser,
    getDataCommonsDisplayNamesForApprovedStudy,
    getDataCommonsDisplayNamesForApprovedStudyList,
    getDataCommonsDisplayNamesForUserOrganization,
    getDataCommonsDisplayNamesForReleasedNode
}
