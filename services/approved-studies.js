const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');
const {ApprovedStudies} = require("../crdc-datahub-database-drivers/domain/approved-studies");
const {ADMIN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const ApprovedStudyDAO = require("../dao/approvedStudy");
const {
    NEW,
    IN_PROGRESS,
    SUBMITTED,
    WITHDRAWN,
    RELEASED,
    REJECTED,
    CANCELED,
    DELETED, ARCHIVED
} = require("../constants/submission-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {getDataCommonsDisplayNamesForApprovedStudy, getDataCommonsDisplayNamesForUser,
    getDataCommonsDisplayNamesForApprovedStudyList
} = require("../utility/data-commons-remapper");
const {ORGANIZATION_COLLECTION, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {SORT, DIRECTION} = require("../crdc-datahub-database-drivers/constants/monogodb-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const CONTROLLED_ACCESS_ALL = "All";
const CONTROLLED_ACCESS_OPEN = "Open";
const CONTROLLED_ACCESS_CONTROLLED = "Controlled";
const CONTROLLED_ACCESS_OPTIONS = [CONTROLLED_ACCESS_ALL, CONTROLLED_ACCESS_OPEN, CONTROLLED_ACCESS_CONTROLLED];
const NA_PROGRAM = "NA";
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");

class ApprovedStudiesService {
    _ALL = "All";
    constructor(approvedStudiesCollection, userCollection, organizationService, submissionCollection, authorizationService) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.userCollection = userCollection;
        this.organizationService = organizationService;
        this.submissionCollection = submissionCollection;
        this.authorizationService = authorizationService;
        this.approvedStudyDAO = new ApprovedStudyDAO();
    }

    async storeApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName, useProgramPC, pendingModelChange, primaryContactID) {
        const approvedStudies = ApprovedStudies.createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName, useProgramPC, pendingModelChange, primaryContactID);
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
     * @param {{ _id: string }} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context the request context
     * @returns {Promise<Object>} The requested ApprovedStudy
     * @throws {Error} If the study is not found
     */
    async getApprovedStudyAPI(params, context) {
        verifySession(context)
          .verifyInitialized();
        return getDataCommonsDisplayNamesForApprovedStudy(await this.getApprovedStudy(params));
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

        const approvedStudy = await this.approvedStudyDAO.getApprovedStudyByID(_id);

        if (!approvedStudy) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }
        // find program/organization by study ID
        approvedStudy.programs = await this._findOrganizationByStudyID(_id);
        // find primaryContact
        if (approvedStudy?.primaryContactID)
        {
            approvedStudy.primaryContact = await this._findUserByID(approvedStudy.primaryContactID);
        }

        return approvedStudy;
    }

    async _findOrganizationByStudyID(studyID)
    {
        const orgIds = await this.organizationService.findByStudyID(studyID);
        if (orgIds && orgIds.length > 0 ) {
            const filters = {_id: {"$in": orgIds}};
            // For the data concierge purpose, the sort should be enabled.
            return await this.organizationService.organizationCollection.aggregate([{ "$match": filters }, {"$sort": {_id: -1}}]);
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
    async listApprovedStudies(studyIDs) {
        return await this.approvedStudyDAO.getApprovedStudiesInStudies(studyIDs);
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
            sortDirection,
            programID
        } = params;

        let pipelines = [
            // Join with the program
            {"$lookup": {
                from: ORGANIZATION_COLLECTION,
                localField: "_id",
                foreignField: "studies._id",
                as: "programs"}},
            {"$lookup": {
                from: USER_COLLECTION,
                localField: "primaryContactID",
                foreignField: "_id",
                as: "primaryContact"}},
            {"$replaceRoot": {
                newRoot: {
                    $mergeObjects: [
                        "$$ROOT",
                        {
                            primaryContact: {
                                _id: {
                                    $cond: [
                                        "$useProgramPC",
                                        { $arrayElemAt: ["$programs.conciergeID", 0] },
                                        { $arrayElemAt: ["$primaryContact._id", 0] }
                                    ]
                                },
                                firstName: {
                                    $cond: [
                                        "$useProgramPC",
                                        {
                                            $ifNull: [
                                                { $arrayElemAt: [
                                                        { $split: [
                                                                { $arrayElemAt: ["$programs.conciergeName", 0] },
                                                                " "
                                                            ] },
                                                        0 // first element → firstName
                                                    ] },
                                                ""
                                            ]
                                        },
                                        { $arrayElemAt: ["$primaryContact.firstName", 0] }
                                    ]
                                },
                                lastName: {
                                    $cond: [
                                        "$useProgramPC",
                                        {
                                            $ifNull: [
                                                { $arrayElemAt: [
                                                        { $split: [
                                                                { $arrayElemAt: ["$programs.conciergeName", 0] },
                                                                " "
                                                            ] },
                                                        1 // second element → lastName
                                                ] },
                                                ""
                                            ]
                                        },
                                        { $arrayElemAt: ["$primaryContact.lastName", 0] }
                                    ]
                                }
                            }
                        }
                    ]
                }
            }}
        ];
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

        if (programID && programID !== this._ALL) {
            matches["programs._id"] = programID;
        }

        pipelines.push({$match: matches});
        const pagination = new MongoPagination(first, offset, orderBy, sortDirection);
        const paginationPipe = pagination.getPaginationPipeline()
        // Added the custom sort
        const isNotStudyName = orderBy !== "studyName";
        const customPaginationPipeline = paginationPipe?.map(pagination =>
            Object.keys(pagination)?.includes("$sort") && isNotStudyName ? {...pagination, $sort: {...pagination.$sort, studyName: DIRECTION.ASC}} : pagination
        );

        const programSort = "programs.name";
        const isProgramSort = orderBy === programSort;
        const programPipeLine = paginationPipe?.map(pagination =>
            Object.keys(pagination)?.includes("$sort") && pagination.$sort === programSort ? {...pagination, $sort: {...pagination.$sort, [programSort]: sortDirection?.toLowerCase() === SORT.DESC ? DIRECTION.DESC : DIRECTION.ASC}} : pagination
        );

        // Always sort programs array inside each document by name DESC
        pipelines.push({
            $addFields: {
                programs: {
                    $cond: [
                        { $isArray: "$programs" },
                        { $sortArray: {
                                input: "$programs",
                                sortBy: { name: DIRECTION.DESC }
                        }},
                        []
                    ]
                }
            }
        });
        // This is the program’s custom sort order; the program name in the first element should be sorted.
        if (isProgramSort) {
            pipelines.push(
                { $unwind: { path: "$programs", preserveNullAndEmptyArrays: true } },
                { $sort: { "programs.name": sortDirection === SORT.DESC ? DIRECTION.DESC : DIRECTION.ASC } },
                { $group: {
                        _id: "$_id",
                        doc: { $first: "$$ROOT" },
                        programs: { $push: "$programs" }
                }},
                { $replaceRoot: {
                        newRoot: { $mergeObjects: ["$doc", { programs: "$programs" }] }
                }}
            );
        }

        pipelines.push({
            $facet: {
                total: [{
                    $count: "total"
                }],
                results: isProgramSort ? programPipeLine : customPaginationPipeline
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
        let approvedStudyList = {total: dataRecords?.total || 0,
            studies: dataRecords?.results || []}
        return getDataCommonsDisplayNamesForApprovedStudyList(approvedStudyList);
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
          .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, ADMIN.MANAGE_STUDIES);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        let {
            name,
            acronym,
            controlledAccess,
            openAccess, 
            dbGaPID,
            ORCID, 
            PI,
            primaryContactID,
            useProgramPC,
            pendingModelChange
        } = this._verifyAndFormatStudyParams(params);
        // check if name is unique
        await this._validateStudyName(name)
        // check primaryContactID 
        let primaryContact = null;
        if (primaryContactID) {
            primaryContact = await this._findUserByID(primaryContactID);
            if (!primaryContact) {  
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT);
            }
            if (primaryContact.role !== USER.ROLES.DATA_COMMONS_PERSONNEL){
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
            }
        }

        if (!acronym){
            acronym = name;
        }
        let newStudy = await this.storeApprovedStudies(name, acronym, dbGaPID, null, controlledAccess, ORCID, PI, openAccess, null, useProgramPC, pendingModelChange, primaryContactID);
        // add new study to organization with name of "NA"
        const org = await this.organizationService.getOrganizationByName(NA_PROGRAM);
        if (org && org?._id) {
            await this.organizationService.storeApprovedStudies(org._id, newStudy._id);
        }
        newStudy = getDataCommonsDisplayNamesForApprovedStudy(newStudy);
        primaryContact = getDataCommonsDisplayNamesForUser(primaryContact);
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
          .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, ADMIN.MANAGE_STUDIES);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const {
            studyID,
            name,
            acronym,
            controlledAccess,
            openAccess,
            dbGaPID,
            ORCID, 
            PI,
            primaryContactID,
            useProgramPC,
            pendingModelChange
        } = this._verifyAndFormatStudyParams(params);
        let updateStudy = await this.approvedStudiesCollection.find(studyID);
        if (!updateStudy || updateStudy.length === 0) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }
        updateStudy = updateStudy[0];
        // check if name is unique
        if (name !== updateStudy.studyName)
            await this._validateStudyName(name)
        updateStudy.studyName = name;
        updateStudy.controlledAccess = controlledAccess;
        updateStudy.useProgramPC = useProgramPC;
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

        if (pendingModelChange !== undefined) {
            updateStudy.pendingModelChange = isTrue(pendingModelChange);
        }

        if (useProgramPC && primaryContactID) {
            throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ATTEMPT);
        }

        let primaryContact = null;
        if(primaryContactID){
            primaryContact = await this._findUserByID(primaryContactID);
            if (!primaryContact) {
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT);
            }
            if (primaryContact.role !== USER.ROLES.DATA_COMMONS_PERSONNEL){
                throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
            }
        }

        updateStudy.primaryContactID = useProgramPC ? null : primaryContactID;
        updateStudy.updatedAt = getCurrentTime();
        const result = await this.approvedStudiesCollection.update(updateStudy);
        if (!result?.acknowledged) {
            throw new Error(ERROR.FAILED_APPROVED_STUDY_UPDATE);
        }

        const programs = await this._findOrganizationByStudyID(studyID);
        const [conciergeName, conciergeEmail] = this._getConcierge(programs, primaryContact, useProgramPC);
        const updatedSubmissions = await this.submissionCollection.updateMany({
            studyID: updateStudy._id,
            status: {$in: [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED]},
            $or: [{conciergeName: { "$ne": conciergeName?.trim() }}, {conciergeEmail: { "$ne": conciergeEmail }}, {studyName: { "$ne": name }}, {studyName: { "$ne": name }}, {studyAbbreviation: { "$ne": updateStudy?.studyAbbreviation }}]}, {
            // To update the data concierge
            conciergeName: conciergeName?.trim(), conciergeEmail, studyName: name, studyAbbreviation: updateStudy?.studyAbbreviation || "", updatedAt: getCurrentTime()});
        if (!updatedSubmissions?.acknowledged) {
            console.log(ERROR.FAILED_PRIMARY_CONTACT_UPDATE, `StudyID: ${studyID}`);
            throw new Error(ERROR.FAILED_PRIMARY_CONTACT_UPDATE);
        }

        let approvedStudy = {...updateStudy, programs: programs, primaryContact: primaryContact};
        return getDataCommonsDisplayNamesForApprovedStudy(approvedStudy);
    }

    _getConcierge(programs, primaryContact, isProgramPrimaryContact) {
        // data concierge from the study
        const [conciergeName, conciergeEmail] = (primaryContact)? [`${primaryContact?.firstName || ""} ${primaryContact?.lastName || ''}`, primaryContact?.email || ""] :
            ["",""];
        // isProgramPrimaryContact determines if the program's data concierge should be used.
        if (isProgramPrimaryContact && programs?.length > 0) {
            const [conciergeID, programConciergeName,  programConciergeEmail] = [programs[0]?.conciergeID || "", programs[0]?.conciergeName || "", programs[0]?.conciergeEmail || ""];
            const isValidProgramConcierge = programConciergeName !== "" && programConciergeEmail !== "" && conciergeID !== "";
            return [isValidProgramConcierge ? programConciergeName : "", isValidProgramConcierge ? programConciergeEmail : ""];
        // no data concierge assigned for the program.
        } else if (isProgramPrimaryContact) {
            return ["", ""]
        }
        return [conciergeName, conciergeEmail];
    }

    /**
     * internal method to find user by ID since can't use the userService to avoid cross-referencing
     * @param {*} userID 
     * @returns 
     */
    async _findUserByID(userID){
        const result = await this.userCollection.aggregate([{"$match": {"_id": userID, "userStatus": USER.STATUSES.ACTIVE}}]);
        return (result && result.length > 0)? result[0]: null;
    }
    /**
     * Validate the identifier format.
     * @param {string} id
     * @returns {boolean}
     */
    _validateIdentifier(id) {
        const regex = /^(\d{4}-){3}\d{3}(\d|X)$/;
        return regex.test(id);
    }

    async _validateStudyName(name) {
        const existingStudy = await this.approvedStudiesCollection.aggregate([{ "$match": {studyName: name}}]);
        if (existingStudy.length > 0) {
            throw new Error(ERROR.DUPLICATE_STUDY_NAME);
        } 
        return true;  
    }

    _verifyAndFormatStudyParams(params) {
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
        if (!!params.ORCID && !this._validateIdentifier(params.ORCID)) {
            throw new Error(ERROR.INVALID_ORCID);
        }
        return params;
    }

    async _getUserScope(userInfo, permission) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, permission);
        const userScope = UserScope.create(validScopes);
        // valid scopes; none, all, role/role:RoleScope
        const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope();
        if (!isValidUserScope) {
            console.warn(ERROR.INVALID_USER_SCOPE, permission);
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }
}

module.exports = {
    ApprovedStudiesService
}
