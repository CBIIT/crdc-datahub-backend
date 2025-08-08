const {verifySession} = require("../verifier/user-info-verifier");
const {v4} = require('uuid')
const {getListDifference} = require("../utility/list-util");
const {INSTITUTION} = require("../crdc-datahub-database-drivers/constants/organization-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {TEST_APPLICATION: asInstitution} = require("../test/test-constants");
const ERROR = require("../constants/error-constants");
const {ADMIN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {replaceErrorString} = require("../utility/string-util");
const {UserScope} = require("../domain/user-scope");
const InstitutionDAO = require("../dao/institution");

class InstitutionService {
    constructor(institutionCollection, authorizationService) {
        this.authorizationService = authorizationService;
        this.institutionDAO = new InstitutionDAO(institutionCollection);
        this.institutionCollection = institutionCollection;
    }

    async getInstitutionByID(id) {
        return await this.institutionDAO.findFirst({id});
    }

    async createInstitution(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, ADMIN.MANAGE_INSTITUTIONS);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const newName = params?.name?.trim();
        if (newName === '') {
            throw new Error(ERROR.EMPTY_INSTITUTION_NAME);
        }

        const validStatus = [INSTITUTION.STATUSES.INACTIVE, INSTITUTION.STATUSES.ACTIVE];
        if (params?.status && !validStatus.includes(params?.status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_INSTITUTION_STATUS, params?.status))
        }

        const institutions = await this._findOneByCaseInsensitiveName(newName);
        if (institutions) {
            throw new Error(ERROR.DUPLICATE_INSTITUTION_NAME, newName);
        }

        if (newName?.trim()?.length > 100) {
            throw new Error(ERROR.MAX_INSTITUTION_NAME_LIMIT);
        }

        const newInstitution = Institution.createInstitution(newName, params?.status);
        const res = await this.institutionDAO.create(newInstitution);
        if (!res) {
            throw new Error(ERROR.FAILED_CREATE_INSTITUTION);
        }
        return res;
    }

    // Returns all institution names as a String array
    async _listInstitutions() {
        const institutions = await this.institutionDAO.findMany();
        let institutionsArray = [];
        institutions.forEach(x => {
            if (x.name) {
                institutionsArray.push(x.name);
            }
        });
        return institutionsArray;
    }

    /**
     * Updates an institution document.
     *
     * @param {Object} params - The update parameters.
     * @param {string} params._id - The ID of the institution to update.
     * @param {string} [params.name] - The new name of the institution (optional).
     * @param {string} [params.status] - The new status of the institution (optional).
     * @param {Object} context - The request context containing session/user info for validation.
     * @returns {Promise<INSTITUTION>} - The updated institution document.
     * @throws {Error} - Throws if fails.
     */
    async updateInstitution(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, ADMIN.MANAGE_INSTITUTIONS);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const {_id: institutionID, name, status} = params;
        const aInstitution = await this.getInstitutionByID(institutionID);
        await this._validateUpdateInstitution(aInstitution, institutionID, name, status);
        const [newName, newStatus] = [name?.trim() || aInstitution.name, status?.trim() || aInstitution.status];
        // no update
        if (newName === aInstitution.name && newStatus === aInstitution.status) {
            return aInstitution;
        }

        // Prisma does not support multiple conditional statements, use updateMany
        const res = await this.institutionDAO.updateMany({
            id: institutionID,
            OR: [
                { name: { not: newName } },
                { status: { not: newStatus } },
            ],
        }, {
            name: newName,
            status: newStatus,
            updatedAt: getCurrentTime(),
        });

        if (!res.count === 1) {
            throw new Error(ERROR.FAILED_UPDATE_INSTITUTION);
        }
        return await this.institutionDAO.findFirst({ id: institutionID });
    }

    /**
     * Get an institution document.
     *
     * @param {Object} params - The graphql parameters.
     * @param {string} params._id - The ID of the institution.
     * @param {string} [params.name] - The new name of the institution (optional).
     * @param {string} [params.status] - The new status of the institution (optional).
     * @param {Object} context - The request context containing session/user info for validation.
     * @returns {Promise<INSTITUTION>} - The institution document.
     * @throws {Error} - Throws if fails.
     */
    async getInstitution(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, ADMIN.MANAGE_INSTITUTIONS);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const {_id: institutionID} = params;
        const aInstitution= await this.getInstitutionByID(institutionID)
        if (!aInstitution) {
            throw new Error(replaceErrorString(ERROR.INSTITUTION_ID_NOT_EXIST, institutionID));
        }
        return aInstitution;
    }


    async _validateUpdateInstitution(currInstitution, institutionID, name, status) {
        if (!currInstitution) {
            throw new Error(replaceErrorString(ERROR.INSTITUTION_ID_NOT_EXIST, institutionID));
        }

        const trimmedName = name?.trim();
        if (trimmedName === '') {
            throw new Error(ERROR.EMPTY_INSTITUTION_NAME);
        }

        if (trimmedName?.length > 100) {
            throw new Error(ERROR.MAX_INSTITUTION_NAME_LIMIT);
        }

        if (trimmedName) {
            const existingInstitution = await this._findOneByCaseInsensitiveName(trimmedName);
            const isDuplicate = (existingInstitution) && existingInstitution?._id !== institutionID
            if (isDuplicate) {
                throw new Error(ERROR.DUPLICATE_INSTITUTION_NAME, trimmedName);
            }
        }

        const validStatus = [INSTITUTION.STATUSES.INACTIVE, INSTITUTION.STATUSES.ACTIVE];
        if (status && !validStatus.includes(status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_INSTITUTION_STATUS, status))
        }
    }

    // note: prisma does not work for insensitive search
    async _findOneByCaseInsensitiveName(name) {
        const institutions = await this.institutionCollection.aggregate([{"$match": {$expr: {
            $eq: [
                { $toLower: "$name" },
                name?.trim()?.toLowerCase()
            ]
        }}}, {"$limit": 1}]);
        return institutions?.length > 0 ? institutions[0] : null;
    }

    async listInstitutions(params, context) {
        verifySession(context)
            .verifyInitialized();

        return await this.institutionDAO.listInstitution(params?.name, params?.offset, params?.first, params?.orderBy, params?.sortDirection, params?.status);
    }

    async addNewInstitutions(institutionList){
        try{
            const institutionNames = new Set(institutionList
                .map(x => x?.name)
                .filter(Boolean) || []).toArray();
            if (institutionNames?.length > 0) {
                const existingInstitutions = await this._listInstitutions();
                const newInstitutionNames = getListDifference(institutionNames, existingInstitutions);
                if (newInstitutionNames.length > 0){
                    const newInstitutions = createNewInstitutions(institutionList);
                    const operations = newInstitutions.map(doc => ({
                        insertOne: { document: doc }
                    }));
                    // Prisma can't create the document with the given ID. Otherwise, it needs to change the scheme.
                    const insertResult = await this.institutionCollection.bulkWrite(operations);
                    const insertedCount = insertResult?.insertedCount ?? 0;
                    if (insertedCount !== newInstitutions.length) {
                        throw new Error(`only ${insertedCount}/${newInstitutions.length} were created successfully`);
                    }
                    console.log(`${insertedCount} new institution(s) created in the database`)
                }
            }
        }
        catch (exception){
            console.error('An exception occurred while attempting to create new institutions: ', exception);
        }
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

function createNewInstitutions(institutionsList){
    let newInstitutions = [];
    institutionsList.forEach(institution => {
        const item = Institution.createInstitution(institution?.name, INSTITUTION.STATUSES.ACTIVE);
        // Created the MongoDB _id
        item._id = institution.id;
        newInstitutions.push(item);
    });
    return newInstitutions;
}


class Institution {
    constructor(name, status) {
        this.name = name;
        this.status = status;
        this.createdAt = this.updatedAt = getCurrentTime();
        this.submitterCount = 0;
    }

    static createInstitution(name, status) {
        return new Institution(name, status);
    }
}

module.exports = {
    InstitutionService
};