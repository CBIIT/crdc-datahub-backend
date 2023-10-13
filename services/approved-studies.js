const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');

class ApprovedStudiesService {

    constructor(approvedStudiesCollection, organizationService) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.organizationService = organizationService;
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
     * - This is an ADMIN only operation.
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async listApprovedStudiesAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyRole([USER.ROLES.ADMIN]);

        return this.listApprovedStudies({});
    }

    /**
     * List Approved Studies of My Org API Interface.
     *
     * Note:
     * - This is open to any authenticated user, but returns only approved studies tied
     *   to the user's organization.
     * - If no organization is associated with the user, an empty array is returned.
     * - If no studies are associated with the user's organization, an empty array is returned.
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async listApprovedStudiesOfMyOrganizationAPI(params, context) {
        verifySession(context)
          .verifyInitialized();

        if (!context.userInfo?.organization?.orgID) {
            return [];
        }

        const organization = await this.organizationService.getOrganizationByID(context.userInfo.organization.orgID);
        if (!organization || !organization?.studies?.length) {
            return [];
        }

        const filters = {
            // NOTE: `studyAbbreviation` is a unique constraint
            studyAbbreviation: {
                $in: organization.studies?.filter((s) => !!s.studyAbbreviation).map((s) => s.studyAbbreviation)
            }
        };
        return this.listApprovedStudies(filters);
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
