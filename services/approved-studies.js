const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const { verifySession } = require('../verifier/user-info-verifier');
const {ApprovedStudies} = require("../crdc-datahub-database-drivers/domain/approved-studies");
const ApprovedStudyDAO = require("../dao/approvedStudy");
const {ADMIN, EMAIL_NOTIFICATIONS} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
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
const {SORT: PRISMA_SORT} = require("../constants/db-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const NA_PROGRAM = "NA";
const NA = "NA";
const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");
const ProgramDAO = require("../dao/program");
const UserDAO = require("../dao/user");
const SubmissionDAO = require("../dao/submission");
const ApplicationDAO = require("../dao/application");
const {PendingGPA} = require("../domain/pending-gpa");
class ApprovedStudiesService {
    constructor(approvedStudiesCollection, userCollection, organizationService, submissionCollection, authorizationService, notificationsService, emailParams) {
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.userCollection = userCollection;
        this.organizationService = organizationService;
        this.authorizationService = authorizationService;
        this.programDAO = new ProgramDAO(organizationService.organizationCollection);
        this.userDAO = new UserDAO(userCollection);
        this.submissionDAO = new SubmissionDAO(submissionCollection);
        this.notificationsService = notificationsService;
        this.emailParams = emailParams;
        this.approvedStudyDAO = new ApprovedStudyDAO(approvedStudiesCollection);
        this.applicationDAO = new ApplicationDAO();
    }

    async storeApprovedStudies(applicationID, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, useProgramPC, pendingModelChange, primaryContactID, pendingGPA, programID) {
        // Validate programID and fall back to NA program if needed
        const program = await this._validateProgramID(programID);
        const validatedProgramID = program?._id;

        const approvedStudies = ApprovedStudies.createApprovedStudies(applicationID, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, useProgramPC, pendingModelChange, primaryContactID, pendingGPA, validatedProgramID);
        const res = await this.approvedStudyDAO.create(approvedStudies);

        if (!res) {
            console.error(ERROR.APPROVED_STUDIES_INSERTION + ` studyName: ${studyName}`);
        }
        return res;
    }

    /**
     * List Approved Studies by a studyName API.
     * @api
     * @param {string} studyName
     * @returns {Promise<Object[]>} An array of ApprovedStudies
     */
    // note: prisma does not work for insensitive search
    async findByStudyName(studyName) {
        return await this.approvedStudiesCollection.aggregate([{"$match": {$expr: {
            $eq: [
                { $toLower: "$studyName" },
                studyName?.trim()?.toLowerCase()
            ]
        }}}, {"$limit": 1}]);
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
        // find program/organization by programID reference
        if (approvedStudy?.programID) {
            approvedStudy.program = await this.organizationService.getOrganizationByID(approvedStudy.programID);
        }
        // find primaryContact
        if (approvedStudy?.primaryContactID)
        {
            approvedStudy.primaryContact = await this._findUserByID(approvedStudy.primaryContactID);
        }

        return approvedStudy;
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

        let dataRecords = await this.approvedStudyDAO.listApprovedStudies(study, controlledAccess, dbGaPID, programID, first, offset, orderBy, sortDirection);
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
     * @returns {Promise<{_id: ID}>} The newly created ApprovedStudy's ID
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
            pendingModelChange,
            isPendingGPA,
            GPAName,
            programID
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

        this._validatePendingGPA(GPAName, controlledAccess, isPendingGPA);
        const pendingGPA = PendingGPA.create(GPAName, isPendingGPA);
        const program = await this._validateProgramID(programID);
        programID = program?._id;
        if (dbGaPID !== undefined) {
            dbGaPID = this._validateDbGaPID(dbGaPID);
        }
        // store the new study
        let newStudy = await this.storeApprovedStudies(null, name, acronym, dbGaPID, null, controlledAccess, ORCID, PI, openAccess, useProgramPC, pendingModelChange, primaryContactID, pendingGPA, programID);
        return {_id: newStudy?._id};
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

        // extract and verify the parameters
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
            pendingModelChange,
            isPendingGPA,
            GPAName,
            programID
        } = this._verifyAndFormatStudyParams(params);
        // Find the study to update
        let updateStudy = await this.approvedStudyDAO.findFirst({id: studyID});
        if (!updateStudy) {
            throw new Error(ERROR.APPROVED_STUDY_NOT_FOUND);
        }

        // Store the original programID before it gets modified to detect changes
        const oldProgramID = updateStudy.programID;

        // study state verifications
        // if the name is changing, verify that the new name is unique
        if (name !== updateStudy.studyName)
            await this._validateStudyName(name)
        // verify the programID or use the NA program
        const program = await this._validateProgramID(programID);
        // verify that useProgramPC is false or primaryContactID is null
        if (useProgramPC && primaryContactID) {
            throw new Error(ERROR.INVALID_PRIMARY_CONTACT_ATTEMPT);
        }
        // verify that the isPendingGPA, controlledAccess, and GPAName variables are compatible
        this._validatePendingGPA(GPAName, controlledAccess, isPendingGPA);
        // find the primary contact if the primaryContactID is provided
        // verify that if the primaryContactID is provided, the primary contact is found and the primary contact role is Data Commons Personnel
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

        // update the study object
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
            updateStudy.dbGaPID = this._validateDbGaPID(dbGaPID);
        }
        if (ORCID !== undefined) {
            updateStudy.ORCID = ORCID;
        }
        if (PI !== undefined) {
            updateStudy.PI = PI;
        }
        const currPendingModelChange = updateStudy.pendingModelChange;
        if (pendingModelChange !== undefined) {
            updateStudy.pendingModelChange = isTrue(pendingModelChange);
        }
        updateStudy.programID = program?._id ?? null;
        if (isTrue(updateStudy.controlledAccess)) {
            if (isPendingGPA != null) {
                updateStudy.isPendingGPA = isPendingGPA;
            }
        }
        if (!isTrue(updateStudy.controlledAccess)) {
            updateStudy.isPendingGPA = false;
        }
        if (GPAName !== undefined) {
            updateStudy.GPAName = GPAName?.trim() || "";
        }
        updateStudy.primaryContactID = useProgramPC ? null : primaryContactID;
        updateStudy.updatedAt = getCurrentTime();
        // update the study in the database
        const result = await this.approvedStudyDAO.update(studyID, updateStudy);
        if (!result) {
            throw new Error(ERROR.FAILED_APPROVED_STUDY_UPDATE);
        }
        // set conciergeID 
        const conciergeID = (useProgramPC ? program?.conciergeID : primaryContact?._id) || "";
        
        const updatedSubmissions = await this.submissionDAO.updateMany({
            studyID: updateStudy._id,
            status: {
                in: [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED],
            },
            conciergeID: { not: conciergeID }},{
            conciergeID: conciergeID,
            updatedAt: getCurrentTime()
        });

        if (!(updatedSubmissions?.count >= 0)) {
            console.log(ERROR.FAILED_PRIMARY_CONTACT_UPDATE, `StudyID: ${studyID}`);
            throw new Error(ERROR.FAILED_PRIMARY_CONTACT_UPDATE);
        }

        // Update submission programID when study program changes
        const newProgramID = program._id ?? null;
        if (oldProgramID !== newProgramID) {
            
            const updatedSubmissionProgramIDs = await this.submissionDAO.updateMany({
                studyID: updateStudy._id,
                status: {
                    // Submission status must be in the list below otherwise it will not be updated
                    // Completed is the only excluded status right now
                    in: [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED],
                },
                programID: { not: newProgramID }
            }, {
                programID: newProgramID,
                updatedAt: getCurrentTime()
            });

            // Logs an error when the updated count is not an integer or less than 0
            if (!(updatedSubmissionProgramIDs?.count >= 0)) {
                console.log(ERROR.FAILED_UPDATE_SUBMISSION, `StudyID: ${studyID} - Failed to update submission programIDs`);
            }
        }

        // extract the current pending GPA and dbGaPID to variables
        const {isPendingGPA: currPendingGPA, dbGaPID: currDbGaPID} = updateStudy;
        // notify the submitter that the pending state has been cleared
        // if the notification fails, an error response will be thrown but the study will still be updated
        const pendingDbGaPID = isTrue(updateStudy.controlledAccess) ? !Boolean(updateStudy?.dbGaPID) : false;
        const pendingGPA = isTrue(updateStudy.controlledAccess) ? Boolean(updateStudy?.isPendingGPA) : false;
        const allPendingsCleared = !isTrue(updateStudy?.pendingModelChange) && !pendingGPA && !pendingDbGaPID;
        const wasPendingDbGaPID = isTrue(updateStudy.controlledAccess) ? !Boolean(currDbGaPID) : false;
        const hadPendingsConditions = isTrue(currPendingModelChange) || isTrue(currPendingGPA) || wasPendingDbGaPID;
        if (allPendingsCleared && hadPendingsConditions && updateStudy?.applicationID) {
            await this._notifyClearPendingState(updateStudy);
        }

        let approvedStudy = {...updateStudy, program: program, primaryContact: primaryContact};
        return getDataCommonsDisplayNamesForApprovedStudy(approvedStudy);
    }
    _validateDbGaPID(dbGaPID) {
        const trimedDbGaPID = String(dbGaPID || "").trim().toLowerCase();
        const re = /^phs\d{6}$/i;
        if (trimedDbGaPID === "") {
            dbGaPID = null;
        }
        else if (!re.test(trimedDbGaPID)) {
            throw new Error(ERROR.INVALID_DB_GAP_ID);
        }
        else {
            dbGaPID = trimedDbGaPID;
        }
        return dbGaPID;
    }
    _validatePendingGPA(GPAName, controlledAccess, isPendingGPA) {
        // verify that controlled access is true or isPendingGPA is false
        if (!isTrue(controlledAccess) && isTrue(isPendingGPA)) {
            throw new Error(ERROR.INVALID_PENDING_GPA);
        }
        // verify that controlled access is true and GPAName is provided or isPendingGPA is true
        if (isTrue(controlledAccess) && (!GPAName || GPAName.trim() === "") && !isTrue(isPendingGPA)) {
            throw new Error(ERROR.INVALID_PENDING_GPA);
        }
    }

    async _notifyClearPendingState(updateStudy) {
        const errorMsg = replaceErrorString(ERROR.FAILED_TO_NOTIFY_CLEAR_PENDING_STATE, `studyID: ${updateStudy?._id}`);
        try{
            const application = await this.applicationDAO.findFirst({id: updateStudy.applicationID});
            if (!application || !application?._id) {
                // internal error for the logs, this will not be displayed to the user
                throw new Error("Unable to find application with ID: " + updateStudy.applicationID);
            }

            const aSubmitter = await this.userDAO.findFirst({id: application?.applicantID});
            if (!aSubmitter?._id) {
                // internal error for the logs, this will not be displayed to the user
                throw new Error("Unable to find submitter with ID: " + application?.applicantID);
            }
            const BCCUsers = await this.userDAO.getUsersByNotifications([EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_PENDING_CLEARED],
                [USER.ROLES.DATA_COMMONS_PERSONNEL, USER.ROLES.FEDERAL_LEAD, USER.ROLES.ADMIN]);
            const filteredBCCUsers = BCCUsers.filter((u) => u?._id !== aSubmitter?._id);

            if (aSubmitter?.notifications?.includes(EMAIL_NOTIFICATIONS.SUBMISSION_REQUEST.REQUEST_PENDING_CLEARED)) {
                const res = await this.notificationsService.clearPendingModelState(aSubmitter?.email, getUserEmails(filteredBCCUsers), {
                    firstName: `${aSubmitter?.firstName} ${aSubmitter?.lastName || ''}`,
                    studyName: updateStudy?.studyName || NA,
                    portalURL: this.emailParams.url || NA,
                    submissionGuideURL: this.emailParams?.submissionGuideURL,
                    contactEmail: this.emailParams.contactEmail || NA,
                });
                if (res?.accepted?.length === 0 || !res) {
                    // internal error for the logs, this will not be displayed to the user
                    throw new Error("Failed to send notification for clearing the approved study; " + updateStudy?._id);
                }
            }
        } catch (error) {
            // log the internal error but throw a general error to be displayed to the user
            console.error(error);
            throw new Error(errorMsg);
        }
    }

    _getConcierge(programs, primaryContact, isProgramPrimaryContact) {
        // isProgramPrimaryContact determines if the program's data concierge should be used.
        if (isProgramPrimaryContact && programs?.length > 0) {
            return programs[0]?.conciergeID || "";
        // no data concierge assigned for the program.
        } else if (isProgramPrimaryContact) {
            return "";
        }
        // data concierge from the study
        return (primaryContact)? primaryContact._id : "";
    }

    /**
     * internal method to find user by ID since can't use the userService to avoid cross-referencing
     * @param {*} userID 
     * @returns 
     */
    async _findUserByID(userID){
        return await this.userDAO.findFirst({"_id": userID, "userStatus": USER.STATUSES.ACTIVE});
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
        const existingStudy = await this.approvedStudyDAO.findMany({studyName: name});
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

    
    /**
     * Validates that the provided programID matches a program in the database.
     * If the provided programID is invalid or null, falls back to the "NA" program.
     * 
     * @param {string|null} programID The program ID to validate
     * @returns {Promise<Object>} The validated program object
     * @throws {Error} If neither the provided programID nor the NA program can be found
     */
    async _validateProgramID(programID) {
        let program = null;
         // verify the provided programID is valid
        if (programID){
            program = await this.organizationService.getOrganizationByID(programID);
        }
        // if the provided programID is not valid was not provided then use the NA program as a fallback
        if (!program){
            program = await this.organizationService.getOrganizationByName(NA_PROGRAM);
        }
        // if the program is still not valid then throw an error, this should not happen
        if (!program){
            console.error("Unable to find a program with the provided programID then unable to find the NA program as a fallback. Please verify that the NA program has been properly initialized.");
            throw new Error(ERROR.STUDY_CREATION_FAILED);
        }
        return program;
    }

}

const getUserEmails = (users) => {
    return users
        ?.filter((aUser) => aUser?.email)
        ?.map((aUser)=> aUser.email);
}

module.exports = {
    ApprovedStudiesService
}
