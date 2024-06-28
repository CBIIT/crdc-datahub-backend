const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');
const {ApprovedStudies} = require("../crdc-datahub-database-drivers/domain/approved-studies");

class ApprovedStudiesService {

    constructor(approvedStudiesCollection, organizationService) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.organizationService = organizationService;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess);
        const existedStudy = (await this.approvedStudiesCollection.aggregate([{ "$match": {studyName, studyAbbreviation}}, { "$limit": 1 }]))?.pop();
        if (existedStudy?._id) {
            approvedStudies._id = existedStudy._id;
        }
        const res = await this.approvedStudiesCollection.findOneAndUpdate({ studyName, studyAbbreviation}, approvedStudies);
        if (!res?.ok) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION + ` studyName: ${studyName}`);
        }
    }

    /**
     * List Approved Studies by a studyAbbreviation API.
     * @api
     * @param {string} - studyAbbreviation
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async findByStudyAbbreviation(studyAbbreviation) {
        return await this.approvedStudiesCollection.aggregate([{ "$match": {studyAbbreviation}}]);
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

module.exports = {
    ApprovedStudiesService
}
