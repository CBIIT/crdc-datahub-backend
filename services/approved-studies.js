const {v4} = require("uuid");
const {ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");

class ApprovedStudiesService {

    constructor(approvedStudiesCollection) {
        this.approvedStudiesCollection = approvedStudiesCollection;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization) {
        // TODO store studyName, dbGaPID
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization);
        const res = this.approvedStudiesCollection.insert(approvedStudies);
        if (!res?.acknowledged) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION);
        }
    }
}

class ApprovedStudies {
    constructor(studyName, studyAbbreviation, dbGaPID, organization) {
        this._id = v4(undefined, undefined, undefined);
        this.studyName = studyName;
        this.studyAbbreviation = studyAbbreviation;
        this.dbGaPID = dbGaPID;
        this.createdAt = this.updatedAt = new getCurrentTime();
        // Optional
        if (organization) {
            this.organization = organization;
        }
    }

    static createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization) {
        return new ApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization);
    }
}

module.exports = {
    ApprovedStudiesService
}