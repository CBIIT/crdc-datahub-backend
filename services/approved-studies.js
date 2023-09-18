const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const ERROR = require("../constants/error-constants");

class ApprovedStudiesService {

    constructor(approvedStudiesCollection) {
        this.approvedStudiesCollection = approvedStudiesCollection;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName);
        const res = await this.approvedStudiesCollection.insert(approvedStudies);
        if (!res?.acknowledged) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION);
        }
    }
}

class ApprovedStudies {
    constructor(studyName, studyAbbreviation, dbGaPID, organizationName) {
        this.studyName = studyName;
        this.studyAbbreviation = studyAbbreviation;
        if (dbGaPID) {
            this.dbGaPID = dbGaPID;
        }
        // Optional
        if (organizationName) {
            this.originalOrg = organizationName;
        }
        this.createdAt = this.updatedAt = getCurrentTime();
    }

    static createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization) {
        return new ApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization);
    }
}

module.exports = {
    ApprovedStudiesService
}