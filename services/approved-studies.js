const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');

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

    /**
     * List Approved Studies API Interface.
     *
     * Note:
     * - This is currently an open API for all logged-in users
     *   filtering on Organization is not implemented in MVP-2.
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async listApprovedStudiesAPI(params, context) {
        verifySession(context)
          .verifyInitialized();

        return this.listApprovedStudies({});
    }

    /**
     * List all approved studies in the collection. Supports filtering.
     *
     * @typedef {Object<string, any>} Filters K:V pairs of filters
     * @param {Filters} [filters] Filters to apply to the query
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async listApprovedStudies(filters = {}) {
        return await this.approvedStudiesCollection.aggregate([{ "$match": filters }]);
    }
}

class ApprovedStudies {
    constructor(studyName, studyAbbreviatin, dbGaPID, organizationName) {
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