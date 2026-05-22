const DISPLAY_NAMES_MAP = require("../constants/data-commons-display-names-map");
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const {defaultStudyAbbreviationToStudyName} = require("./study-abbrev-helpers");


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

/**
 * For listSubmissions only: when studyAbbreviation is empty, expose studyName in its place in the response.
 * @param {Object} submission list row from DAO (may be mutated)
 */
function applyStudyAbbreviationFallbackToListSubmission(submission) {
    if (!submission) {
        return submission;
    }
    const name = submission.studyName ?? submission.study?.studyName;
    const resolved = defaultStudyAbbreviationToStudyName(
        submission.studyAbbreviation ?? submission.study?.studyAbbreviation,
        name
    );
    submission.studyAbbreviation = resolved;
    if (submission.study) {
        submission.study = {
            ...submission.study,
            studyAbbreviation: defaultStudyAbbreviationToStudyName(
                submission.study.studyAbbreviation,
                submission.study.studyName
            )
        };
    }
    return submission;
}

function getDataCommonsDisplayNamesForListSubmissions(listSubmissions){
    if (!listSubmissions){
        return null;
    }
    if (listSubmissions.submissions){
        listSubmissions.submissions = genericGetDataCommonsDisplayNames(listSubmissions.submissions, getDataCommonsDisplayNamesForSubmission);
        listSubmissions.submissions = listSubmissions.submissions.map(applyStudyAbbreviationFallbackToListSubmission);
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
    approvedStudy.pendingImageDeIdentification = isTrue(approvedStudy.pendingImageDeIdentification);
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
    applyStudyAbbreviationFallbackToListSubmission,
    getDataCommonsDisplayNamesForUser,
    getDataCommonsDisplayNamesForApprovedStudy,
    getDataCommonsDisplayNamesForApprovedStudyList,
    getDataCommonsDisplayNamesForUserOrganization,
    getDataCommonsDisplayNamesForReleasedNode
}
