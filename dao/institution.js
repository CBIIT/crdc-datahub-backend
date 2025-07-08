
const { MODEL_NAME, SORT} = require('../constants/db-constants');
const {INSTITUTION} = require("../crdc-datahub-database-drivers/constants/organization-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const GenericDAO = require("./generic");
const {USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const ROLES = USER_CONSTANTS.USER.ROLES;
class InstitutionDAO extends GenericDAO {

    _ALL_FILTER = "All";
    constructor(institutionCollection) {
        super(MODEL_NAME.INSTITUTIONS);
        this.institutionCollection = institutionCollection;
    }
    // Can't use prisma because of userCount sort.
    async listInstitution(name, offset, first, orderBy, sortDirection, status) {
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

        const paginationPipe = new MongoPagination(first, offset, orderBy, sortDirection);
        const pipeline = [{"$match": this._listConditions(name, status)}, userJoin,
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
}
module.exports = InstitutionDAO