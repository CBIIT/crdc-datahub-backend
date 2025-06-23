const {verifySession} = require("../verifier/user-info-verifier");
const {v4} = require('uuid')
const {getListDifference} = require("../utility/list-util");
const {INSTITUTION} = require("../crdc-datahub-database-drivers/constants/organization-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {TEST_APPLICATION: asInstitution} = require("../test/test-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const ERROR = require("../constants/error-constants");
const {ADMIN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {replaceErrorString} = require("../utility/string-util");
const {UserScope} = require("../domain/user-scope");

class InstitutionService {
    _ALL_FILTER = "All";
    constructor(institutionCollection, userCollection, authorizationService) {
        this.institutionCollection = institutionCollection;
        this.userCollection = userCollection;
        this.authorizationService = authorizationService;
    }

    async getInstitutionByID(id) {
        return (await this.institutionCollection.find(id))?.pop();
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
        if (institutions.length > 0) {
            throw new Error(ERROR.DUPLICATE_INSTITUTION_NAME, newName);
        }

        if (newName?.trim()?.length > 100) {
            throw new Error(ERROR.MAX_INSTITUTION_NAME_LIMIT);
        }

        const newInstitution = Institution.createInstitution(newName, params?.status);
        const res = await this.institutionCollection.insert(newInstitution);
        if (!res?.acknowledged) {
            throw new Error(ERROR.FAILED_CREATE_INSTITUTION);
        }
        return newInstitution;
    }

    // Returns all institution names as a String array
    async _listInstitutions() {
        const institutions = await this.institutionCollection.findAll();
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

        const res = await this.institutionCollection.findOneAndUpdate(
            // Condition
            {_id: institutionID, $or: [{ name: { $ne : newName}}, { status: { $ne : newStatus}}]},
            // New Update
            {name: newName, status: newStatus, updatedAt: getCurrentTime()}, {returnDocument: 'after'});
        if (!res?.value) {
            throw new Error(ERROR.FAILED_UPDATE_INSTITUTION);
        }
        return res.value;
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
        return await this.getInstitutionByID(institutionID);
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
            const existingInstitutions = await this._findOneByCaseInsensitiveName(trimmedName);
            const isDuplicate = existingInstitutions.some(inst => inst?._id !== institutionID);
            if (isDuplicate) {
                throw new Error(ERROR.DUPLICATE_INSTITUTION_NAME, trimmedName);
            }
        }

        const validStatus = [INSTITUTION.STATUSES.INACTIVE, INSTITUTION.STATUSES.ACTIVE];
        if (status && !validStatus.includes(status)) {
            throw new Error(replaceErrorString(ERROR.INVALID_INSTITUTION_STATUS, status))
        }
    }

    // find one institution by a name
    async _findOneByCaseInsensitiveName(name) {
        return await this.institutionCollection.aggregate([{
            $match: {
                $expr: {
                    $eq: [
                        { $toLower: "$name" },
                        name?.toLowerCase()
                    ]
                }
            }
        }, { $limit: 1 }]);
    }

    // Verify the user session then call listInsitutions()
    async listInstitutions(params, context) {
        verifySession(context)
            .verifyInitialized();

        const userJoin = {
            "$lookup": {
                from: USER_COLLECTION,
                let : {id : "$_id"},
                pipeline: [{
                    $match: {
                        $expr: {
                            $and: [
                                { $eq: ["$institution._id", "$$id"] },
                                { $eq: ["$role", ROLES.SUBMITTER] }
                            ]
                        }
                    }
                }],
                as: "submitters"}
        };

        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const pipeline = [{"$match": this._listConditions(params?.name, params?.status)}, userJoin,
            {
            $project: {
                _id: 1,
                name: 1,
                status: 1,
                submitterCount: { $size: "$submitters" }
            }

        }];

        const noPaginationPipeline = pipeline.concat(paginationPipe.getNoLimitPipeline());
        const promises = [
            await this.institutionCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            await this.institutionCollection.aggregate(noPaginationPipeline.concat([{ $group: { _id: "$_id" } }, { $count: "count" }]))
        ];

        const results = await Promise.all(promises);
        return {
            institutions: results[0] || [],
            total: results[1]?.length > 0 ? results[1][0]?.count : 0
        }
    }

    _listConditions(institutionName, status){
        const validStatus = [INSTITUTION.STATUSES.INACTIVE, INSTITUTION.STATUSES.ACTIVE];
        const nameCondition = institutionName ? {name: { $regex: institutionName?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const statusCondition = status && status !== this._ALL_FILTER ?
            { status: { $in: [status] || [] } } : { status: { $in: validStatus } };
        return {...nameCondition , ...statusCondition}
    }

    async addNewInstitutions(institutionNames){
        try{
            const existingInstitutions = await this._listInstitutions();
            const newInstitutionNames = getListDifference(institutionNames, existingInstitutions);
            if (newInstitutionNames.length > 0){
                const newInstitutions = createNewInstitutions(newInstitutionNames);
                const insertResult = await this.institutionCollection.insertMany(newInstitutions);
                const insertedCount = insertResult?.insertedCount;
                if (insertedCount !== newInstitutions.length){
                    throw new Error(`only ${insertedCount}/${newInstitutions.length} were created successfully`);
                }
                console.log(`${insertedCount} new institution(s) created in the database`)
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

function createNewInstitutions(institutionNames){
    let newInstitutions = [];
    institutionNames.forEach(name => {
        newInstitutions.push(Institution.createInstitution(name));
    });
    return newInstitutions;
}


class Institution {
    constructor(name, status) {
        this._id = v4(undefined, undefined, undefined)
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
    InstitutionService,
    createNewInstitutions
};