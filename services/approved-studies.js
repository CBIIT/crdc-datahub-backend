const {v4} = require("uuid");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');
const {ApprovedStudies} = require("../crdc-datahub-database-drivers/domain/approved-studies");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {ADMIN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {
    NEW,
    IN_PROGRESS,
    SUBMITTED,
    WITHDRAWN,
    RELEASED,
    REJECTED,
    COMPLETED,
    CANCELED,
    DELETED, ARCHIVED
} = require("../constants/submission-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const CONTROLLED_ACCESS_ALL = "All";
const CONTROLLED_ACCESS_OPEN = "Open";
const CONTROLLED_ACCESS_CONTROLLED = "Controlled";
const CONTROLLED_ACCESS_OPTIONS = [CONTROLLED_ACCESS_ALL, CONTROLLED_ACCESS_OPEN, CONTROLLED_ACCESS_CONTROLLED];
class ApprovedStudiesService {

    constructor(approvedStudiesCollection, userCollection, organizationService, submissionCollection) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.userCollection = userCollection;
        this.organizationService = organizationService;
        this.submissionCollection = submissionCollection;
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName);
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
     * Get an Approved Study by ID API Interface.
     * 
     * @api
     * @note This is an ADMIN only operation.
     * @param {{ _id: string }} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context the request context
     * @returns {Promise<Object>} The requested ApprovedStudy
     * @throws {Error} If the study is not found
     */
    async getApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyPermission(ADMIN.MANAGE_STUDIES)

        return this.getApprovedStudy(params);
    }


    /**
     * Fetch an approved study by ID.
     * 
     * @note This does not perform any RBAC checks. 
     * @see {@link getApprovedStudyAPI} for the API interface.
     * @param {{ _id: string }} params The endpoint parameters
     * @returns {Promise<Object>} The requested ApprovedStudy
     * @throws {Error} If the study is not found or the ID is invalid
     */
    async getApprovedStudy({ _id }) {
        if (!_id || typeof _id !== "string") {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }

        const study = await this.approvedStudiesCollection.find(_id);
        if (!study || !study.length) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }
        let returnStudy = study[0];
        // find program/organization by study ID
        returnStudy.programs = await this.#findOrganizationByStudyID(_id)
        // find primaryContact
        if (returnStudy?.primaryContactID)
        {
            returnStudy.primaryContact = await this.#findUserByID(returnStudy.primaryContactID);
        }

        return returnStudy;
    }

    async #findOrganizationByStudyID(studyID)
    {
        const orgIds = await this.organizationService.findByStudyID(studyID);
        if (orgIds && orgIds.length > 0 ) {
            const filters = {_id: {"$in": orgIds}};
            return await this.organizationService.organizationCollection.aggregate([{ "$match": filters }]);
        }
        return null;
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
                if (controlledAccess === CONTROLLED_ACCESS_CONTROLLED)
                {
                    matches.controlledAccess = true;
                }
                else
                {
                    matches.openAccess = true;
                }
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
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context request context
     * @returns {Promise<Object>} The newly created ApprovedStudy
     */
    async addApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyPermission(ADMIN.MANAGE_STUDIES);
        let {
            name,
            acronym,
            controlledAccess,
            openAccess, 
            dbGaPID,
            ORCID, 
            PI,
            primaryContactID
        } = this.#verifyAndFormatStudyParams(params);
        // check if name is unique
        await this.#validateStudyName(name)
        // check primaryContactID 
        let primaryContact = null;
        if (primaryContactID) {
            primaryContact = await this.#findUserByID(primaryContactID);
            if (!primaryContact) {  
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT);
            }
            if (primaryContact.role !== USER.ROLES.DATA_COMMONS_PERSONNEL){
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
            }
        }
        const current_date = new Date();
        if (!acronym){
            acronym = name;
        }
        let newStudy = {_id: v4(), studyName: name, studyAbbreviation: acronym, controlledAccess: controlledAccess, openAccess: openAccess, dbGaPID: dbGaPID, ORCID: ORCID, PI: PI, primaryContactID: primaryContactID, createdAt: current_date, updatedAt: current_date};
        const result = await this.approvedStudiesCollection.insert(newStudy);
        if (!result?.acknowledged) {
            throw new Error(ERROR.FAILED_APPROVED_STUDY_INSERTION);
        }
        return {...newStudy, primaryContact: primaryContact};
    }
    /**
     * Edit Approved Study API
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async editApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized()
          .verifyPermission(ADMIN.MANAGE_STUDIES);

        const {
            studyID,
            name,
            acronym,
            controlledAccess,
            openAccess,
            dbGaPID,
            ORCID, 
            PI,
            primaryContactID
        } = this.#verifyAndFormatStudyParams(params);
        let updateStudy = await this.approvedStudiesCollection.find(studyID);
        if (!updateStudy || updateStudy.length === 0) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }
        updateStudy = updateStudy[0];
        // check if name is unique
        if (name !== updateStudy.studyName)
            await this.#validateStudyName(name)
        updateStudy.studyName = name;
        updateStudy.controlledAccess = controlledAccess;
        if (!!acronym) {
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
        let  primaryContact = null;
        if(primaryContactID){
            primaryContact = await this.#findUserByID(primaryContactID);
            if (!primaryContact) {
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT);
            }
            if (primaryContact.role !== USER.ROLES.DATA_COMMONS_PERSONNEL){
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
            }
        }
        updateStudy.primaryContactID = primaryContactID;
        updateStudy.updatedAt = getCurrentTime();
        const result = await this.approvedStudiesCollection.update(updateStudy);
        if (!result?.acknowledged) {
            throw new Error(ERROR.FAILED_APPROVED_STUDY_UPDATE);
        }

        const [conciergeName, conciergeEmail] = [`${primaryContact?.firstName} ${primaryContact?.lastName || ''}`, primaryContact?.email];
        const updatedSubmissions = await this.submissionCollection.updateMany({
                studyID: updateStudy._id,
                status: {$in: [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED]},
                conciergeName: { "$ne": conciergeName },
                conciergeEmail: { "$ne": conciergeEmail }}, {
            // To update the primary contacts
            conciergeName, conciergeEmail, updatedAt: getCurrentTime()});
        if (!updatedSubmissions?.acknowledged) {
            console.log(ERROR.FAILED_PRIMARY_CONTACT_UPDATE, `StudyID: ${studyID}`);
            throw new Error(ERROR.FAILED_PRIMARY_CONTACT_UPDATE);
        }
        const programs = await this.#findOrganizationByStudyID(studyID)
        return {...updateStudy, programs: programs, primaryContact: primaryContact};  
    }
    /**
     * internal method to find user by ID since can't use the userService to avoid cross-referencing
     * @param {*} userID 
     * @returns 
     */
    async #findUserByID(userID){
        const result = await this.userCollection.aggregate([{"$match": {"_id": userID, "userStatus": USER.STATUSES.ACTIVE}}]);
        return (result && result.length > 0)? result[0]: null;
    }
    /**
     * Validate the identifier format.
     * @param {string} id
     * @returns {boolean}
     */
    #validateIdentifier(id) {
        const regex = /^(\d{4}-){3}\d{3}(\d|X)$/;
        return regex.test(id);
    }

    async #validateStudyName(name) {
        const existingStudy = await this.approvedStudiesCollection.aggregate([{ "$match": {studyName: name}}]);
        if (existingStudy.length > 0) {
            throw new Error(ERROR.DUPLICATE_STUDY_NAME);
        } 
        return true;  
    }

    #verifyAndFormatStudyParams(params) {
        // trim name if it exists
        if (!!params.name && params.name.length > 0) {
            params.name = params.name.trim();
        }
        // trim acronym if it exists
        if (!!params.acronym && params.acronym.length > 0) {
            params.acronym = params.acronym.trim();
        }
        // ensure controlledAccess has a boolean value
        params.controlledAccess = params.controlledAccess === true;
        // verify name exists and is not an empty string
        if (!params.name) {
            throw new Error(ERROR.MISSING_STUDY_NAME);
        }
        // verify that dbGaPID exists if the study is controlledAccess
        if (!!params.controlledAccess && !params.dbGaPID){
            throw new Error(ERROR.MISSING_DB_GAP_ID);
        }
        // validate that ORCID if it exists
        if (!!params.ORCID && !this.#validateIdentifier(params.ORCID)) {
            throw new Error(ERROR.INVALID_ORCID);
        }
        return params;
    }
}

module.exports = {
    ApprovedStudiesService
}
