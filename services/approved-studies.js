const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const ERROR = require("../constants/error-constants");

class ApprovedStudiesService {

    constructor(approvedStudiesCollection) {
        this.approvedStudiesCollection = approvedStudiesCollection;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName);
        // A study name must be unique to avoid duplication.
        const res = await this.approvedStudiesCollection.findOneAndUpdate({ studyName: studyName },approvedStudies);
        if (!res?.acknowledged) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION);
        }
    }
    async listApprovedStudies(params, context) {
        let pipeline = [{ $match: {} }];
        // More filtering based on role may change later on in MVP-2
        // if (context.userInfo?.role === "Submitter" || context.userInfo?.role === "Organization Owner"){
        //     pipeline = [{"$match": {"originalOrg": context.userInfo?.organization.orgName}}];
        // }
        const promises = [this.approvedStudiesCollection.aggregate(pipeline)]
        return await Promise.all(promises).then(function(results) {
            console.log(results[0]);
            return results[0];
        });
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