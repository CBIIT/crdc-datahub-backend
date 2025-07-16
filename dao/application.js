const prisma = require("../prisma");
const { MODEL_NAME, SORT} = require('../constants/db-constants');
const GenericDAO = require("./generic");
const {convertIdFields, convertMongoFilterToPrismaFilter} = require('./utils/orm-converter');

const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");

class ApplicationDAO extends GenericDAO {
    constructor(applicationCollection) {
        super(MODEL_NAME.APPLICATION);
        this.applicationCollection = applicationCollection;
    }
    // Prisma can't join _id in the object.
    async updateApplicationOrg(orgID, updatedOrg){
        return await this.applicationCollection.updateMany(
            {"organization._id": orgID, "organization.name": {"$ne": updatedOrg.name}},
            {"organization.name": updatedOrg.name, updatedAt: getCurrentTime()}
        )
    }

    async insert(application) {
        const createdData = convertIdFields(application);
        const created = await this.create(createdData);
        return { acknowledged: !!created, insertedId: created.id };
    }

    async update(application) {
        // check if _id or id is present
        if (!application._id && !application.id) {
            throw new Error('Application must have an _id or id');
        }
        // remove institution object if it exists
        if (application.institution) {
            delete application.institution;
        }
        // use super.update to call the update method from GenericDAO
        return await super.update(application._id, application);
    }

    async updateMany(filter, data) {
        // Prisma expects a plain object for update, not MongoDB-style operators
        const updateDoc = Array.isArray(data)
            ? Object.assign({}, ...data)
            : data;

        filter = convertMongoFilterToPrismaFilter(filter);
        const result = await prisma.application.updateMany({
            where: filter,
            data: updateDoc
        });
        return { matchedCount: result.count, modifiedCount: result.count };
    }

    async aggregate(pipeline) {
        // Only support simple $match, $sort, $limit for now
        let query = {};
        let orderBy = undefined;
        let take = undefined;
        for (const stage of pipeline) {
            if (stage.$match) query = { ...query, ...stage.$match };
            if (stage.$sort) {
                orderBy = Object.entries(stage.$sort).map(([field, dir]) => ({
                    [field]: dir === -1 ? SORT.DESC : SORT.ASC
                }));
            }
            if (stage.$limit) take = stage.$limit;
        }
        query = convertMongoFilterToPrismaFilter(query);

        // Flatten dot notation for nested fields (e.g., "applicant.applicantID")
        // Prisma expects: { applicant: { is: { applicantID: ... } } }
        for (const key of Object.keys(query)) {
            if (key.includes('.')) {
                const [parent, child] = key.split('.');
                // If already an object, merge
                if (!query[parent]) query[parent] = {};
                if (!query[parent].is) query[parent].is = {};
                query[parent].is[child] = query[key];
                delete query[key];
            }
        }
        const apps = await prisma.application.findMany({
            where: query,
            orderBy,
            take
        });
        return apps.map(app => ({ ...app, _id: app.id }));
    }

    async distinct(field, filter = {}) {
        filter = convertMongoFilterToPrismaFilter(filter);
        // Handle dot notation for nested fields (e.g., "applicant.applicantName")
        let select = {};
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            select[parent] = { select: { [child]: true } };
        } else {
            select[field] = true;
        }

        const apps = await prisma.application.findMany({ where: filter, select });
        // Flatten nested fields if needed
        const values = field.includes('.')
            ? apps.map(app => {
                const [parent, child] = field.split('.');
                return app[parent]?.[child];
            })
            : apps.map(app => app[field]);
        return [...new Set(values)].filter(v => v !== undefined && v !== null);
    }
}

module.exports = ApplicationDAO;