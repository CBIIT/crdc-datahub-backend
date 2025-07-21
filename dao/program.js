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
    async getOrganizationByID(id, omitStudyLookup = false) {
        const pipeline = [];

        if (!omitStudyLookup) {
            pipeline.push(
                {
                    $lookup: {
                        from: APPROVED_STUDIES_COLLECTION,
                        localField: "studies._id",
                        foreignField: "_id",
                        as: "studies"
                    }
                },
            );
        }

        pipeline.push({"$match": {_id: id}});
        pipeline.push({"$limit": 1});
        const result = await this.organizationCollection.aggregate(pipeline);
        return result?.length > 0 ? result[0] : null;
    }

    async getOrganizationByName(name, omitStudyLookup = true) {
        const pipeline = [];
        // TODO replace study ID
        if (!omitStudyLookup) {
            pipeline.push(
                {
                    $lookup: {
                        from: APPROVED_STUDIES_COLLECTION,
                        localField: "studies._id",
                        foreignField: "_id",
                        as: "studies"
                    }
                },
            );
        }
        pipeline.push({"$match": {name: { $regex: name?.trim().replace(/\\/g, "\\\\"), $options: "i" }}});
        pipeline.push({"$limit": 1});
        const result = await this.organizationCollection.aggregate(pipeline);
        return result?.length > 0 ? result[0] : null;
    }
    // can't use prisma because the prisma can't map studies._id to join other collections
    async listPrograms(first, offset, orderBy, sortDirection, statusCondition) {
        const pagination = new MongoPagination(first, offset, orderBy, sortDirection);
        const paginationPipeline = pagination.getPaginationPipeline();
        const programs = await this.organizationCollection.aggregate([
            {
                $lookup: {
                    from: APPROVED_STUDIES_COLLECTION,
                    localField: "studies._id",
                    foreignField: "_id",
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

    async getOrganizationIDsByStudyID(studyID) {
        return await this.organizationCollection.distinct("_id", {"studies._id": studyID});
    }
}
module.exports = ProgramDAO