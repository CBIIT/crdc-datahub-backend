const {v4} = require("uuid");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');
const {ApprovedStudies} = require("../crdc-datahub-database-drivers/domain/approved-studies");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const CONTROLLED_ACCESS_ALL = "All";
const CONTROLLED_ACCESS_OPEN = "Open";
const CONTROLLED_ACCESS_CONTROLLED = "Controlled";
const CONTROLLED_ACCESS_OPTIONS = [CONTROLLED_ACCESS_ALL, CONTROLLED_ACCESS_OPEN, CONTROLLED_ACCESS_CONTROLLED];
class ApprovedStudiesService {

    constructor(approvedStudiesCollection, organizationService) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.organizationService = organizationService;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess);
        const res = await this.approvedStudiesCollection.findOneAndUpdate({ studyName }, approvedStudies, {returnDocument: 'after', upsert: true});
        if (!res?.value) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION + ` studyName: ${studyName}`);
        }
        return res.value;
    }

    /**
     * List Approved Studies by a studyName API.
     * @api
     * @param {string} studyName
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async findByStudyName(studyName) {
        return await this.approvedStudiesCollection.aggregate([{ "$match": {studyName}}]);
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

    /**
     * List Approved Studies API Interface
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    async listApprovedStudiesAPI(params, context) {
        verifySession(context)
          .verifyInitialized();
        
        const {
            controlledAccess,
            study,
            dbGaPID,
            first,
            offset,
            orderBy,
            sortDirection
        } = params;

        let pipelines = [];
        // set matches
        let matches = {};
        if (study)
            matches.$or = [{studyName: {$regex: study, $options: 'i'}}, {studyAbbreviation: {$regex: study, $options: 'i'}}];
        if (controlledAccess) {
            if (!CONTROLLED_ACCESS_OPTIONS.includes(controlledAccess)) {
                throw new Error(ERROR.INVALID_CONTROLLED_ACCESS);
            }
            if (controlledAccess !== CONTROLLED_ACCESS_ALL)
            {
                matches.controlledAccess = (controlledAccess === CONTROLLED_ACCESS_CONTROLLED);
            }
        }
       
        if (dbGaPID) {
            matches.dbGaPID = {$regex: dbGaPID, $options: 'i'};
        }
        pipelines.push({$match: matches});
        // set sort
        let page_pipeline = [];
        let sortFields = {
            [orderBy]: getSortDirection(sortDirection),
        };
        if (orderBy !== "studyName"){
            sortFields["studyName"] = 1
        }
        page_pipeline.push({
            $sort: sortFields
        });
        // if -1, returns all data of given node & ignore offset
        if (first !== -1) {
            page_pipeline.push({
                $skip: offset
            });
            page_pipeline.push({
                $limit: first
            });
        }

        pipelines.push({
            $facet: {
                total: [{
                    $count: "total"
                }],
                results: page_pipeline
            }
        });
        pipelines.push({
            $set: {
                total: {
                    $first: "$total.total",
                }
            }
        });

        let dataRecords = await this.approvedStudiesCollection.aggregate(pipelines);
        dataRecords = dataRecords.length > 0 ? dataRecords[0] : {}
        return {total: dataRecords?.total || 0,
            studies: dataRecords?.results || []}
    }

    /**
     * Add Approved Study API Interface.
     *
     * Note:
     * - This is an ADMIN only operation.
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object>} The newly created ApprovedStudy
     */
    async addApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyRole([USER.ROLES.ADMIN]);
        const {
            name,
            acronym,
            controlledAccess,
            openAccess, 
            dbGaPID,
            ORCID, 
            PI
        } = params;
        if (!name) {
            throw new Error(ERROR.MISSING_STUDY_NAME);
        }
        const controlledAccessVal = (controlledAccess !== true)? false: true;
        if (controlledAccess === true && !dbGaPID){
            throw new Error(ERROR.MISSING_DB_GAP_ID);
        }
        if (ORCID && !this.#validateIdentifier(ORCID)) {
            throw new Error(ERROR.INVALID_ORCID);
        }
        const current_date = new Date();
        let newStudy = {_id: v4(), studyName: name, studyAbbreviation: acronym, controlledAccess: controlledAccessVal, openAccess: openAccess, dbGaPID: dbGaPID, ORCID: ORCID, PI: PI, createdAt: current_date, updatedAt: current_date};
        const result = await this.approvedStudiesCollection.insert(newStudy);
        if (!result?.acknowledged) {
            throw new Error(ERROR.FAILED_APPROVED_STUDIES_INSERTION);
        }
        return newStudy;
    }
    /**
     * Edit Approved Study API
     * 
     * Note:
     * - This is an ADMIN only operation.
     *
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async editApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyRole([USER.ROLES.ADMIN]);

        const {
            studyID,
            name,
            acronym,
            controlledAccess,
            openAccess,
            dbGaPID,
            ORCID, 
            PI
        } = params;
        let updateStudy = await this.approvedStudiesCollection.find(studyID);
        if (!updateStudy || updateStudy.length === 0) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }
        updateStudy = updateStudy[0];
        if (!name) {
            throw new Error(ERROR.MISSING_STUDY_NAME);
        }
        const controlledAccessVal = (controlledAccess !== true)? false: true;
        
        if (controlledAccess === true && !dbGaPID){
            throw new Error(ERROR.MISSING_DB_GAP_ID);
        }
        if (ORCID && !this.#validateIdentifier(ORCID)) {
            throw new Error(ERROR.INVALID_ORCID);
        }     
        updateStudy.studyName = name;
        updateStudy.controlledAccess = controlledAccessVal;
        if (acronym !== undefined) {
            updateStudy.studyAbbreviation = acronym;
        }
        if(openAccess !== undefined){
            updateStudy.openAccess = openAccess;
        }
        if (dbGaPID !== undefined) {
            updateStudy.dbGaPID = dbGaPID;
        }
        if (ORCID !== undefined) {
            updateStudy.ORCID = ORCID;
        }
        if (PI !== undefined) {
            updateStudy.PI = PI;
        }
        updateStudy.updatedAt = new Date();
        const result = await this.approvedStudiesCollection.update(updateStudy);
        if (!result?.acknowledged) {
            throw new Error(ERROR.FAILED_APPROVED_STUDY_UPDATE);
        }
        return updateStudy;  
    }
    /**
     * Validate the identifier format.
     * @param {string} id
     * @returns {boolean}
     */
    #validateIdentifier(id) {
        const regex = /^\d{4}-\d{4}-\d{4}-\d{4}$/;
        return regex.test(id);
    }
}

module.exports = {
    ApprovedStudiesService
}
