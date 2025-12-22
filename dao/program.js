const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {APPROVED_STUDIES_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const prisma = require("../prisma");


class ProgramDAO extends GenericDAO {
    constructor(organizationCollection) {
        super(MODEL_NAME.PROGRAM);
        this.organizationCollection = organizationCollection;
    }
    // can't join because prisam can't join _id in the object
    async getOrganizationByID(id) {
        return await this.findById(id);
    }

    async getOrganizationByName(name) {
        return await this.findFirst({
            name: name?.trim()
        });
    }
    async listPrograms(first, offset, orderBy, sortDirection, statusCondition) {
        const pagination = new MongoPagination(first, offset, orderBy, sortDirection);
        const paginationPipeline = pagination.getPaginationPipeline();
        const programs = await this.organizationCollection.aggregate([
            {
                $lookup: {
                    from: APPROVED_STUDIES_COLLECTION,
                    localField: "_id",
                    foreignField: "programID",
                    as: "studies"
                }
            },
            {"$match": statusCondition},
            {
                $facet: {
                    total: [{
                        $count: "total"
                    }],
                    results: paginationPipeline
                }
            },
            {
                $set: {
                    total: {
                        $first: "$total.total",
                    }
                }
            }
        ]);
        return programs.length > 0 ? programs[0] : {};
    }

}
module.exports = ProgramDAO