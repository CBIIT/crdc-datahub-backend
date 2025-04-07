const {verifySession} = require("../verifier/user-info-verifier");
const {v4} = require('uuid')
const {getListDifference} = require("../utility/list-util");
const {INSTITUTION} = require("../crdc-datahub-database-drivers/constants/organization-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
class InstitutionService {
    #ALL_FILTER = "All";
    constructor(institutionCollection) {
        this.institutionCollection = institutionCollection;
    }

    async getInstitutionByID(id) {
        return (await this.institutionCollection.find(id))?.pop();
    }

    // Returns all institution names as a String array
    async #listInstitutions() {
        const institutions = await this.institutionCollection.findAll();
        let institutionsArray = [];
        institutions.forEach(x => {
            if (x.name) {
                institutionsArray.push(x.name);
            }
        });
        return institutionsArray;
    }

    // Verify the user session then call #listInsitutions()
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
        const pipeline = [{"$match": this.#listConditions(params?.name, params?.status)}, userJoin,
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

    #listConditions(institutionName, status){
        const validStatus = [INSTITUTION.STATUSES.INACTIVE, INSTITUTION.STATUSES.ACTIVE];
        const nameCondition = institutionName ? {name: { $regex: institutionName?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const statusCondition = status && status !== this.#ALL_FILTER ?
            { status: { $in: [status] || [] } } : { status: { $in: validStatus } };
        return {...nameCondition , ...statusCondition}
    }

    async addNewInstitutions(institutionNames){
        try{
            const existingInstitutions = await this.#listInstitutions();
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
}

function createNewInstitutions(institutionNames){
    let newInstitutions = [];
    institutionNames.forEach(name => {
        newInstitutions.push({
            _id: v4(undefined, undefined, undefined),
            name: name
        });
    });
    return newInstitutions;
}

module.exports = {
    InstitutionService,
    createNewInstitutions
};