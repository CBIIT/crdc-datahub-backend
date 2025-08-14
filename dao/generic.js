const prisma = require("../prisma");
const {convertMongoFilterToPrismaFilter, 
    handleDotNotation,
    mongoSortToPrismaOrderBy} = require('./utils/orm-converter');
const {SORT} = require('../constants/db-constants');

class GenericDAO {
    constructor(modelName) {
        this.model = prisma[modelName];
    }

    async create(data) {
        const res = await this.model.create({ data });
        return { ...res, _id: res.id };
    }

    async createMany(data) {
        return await this.model.createMany({data});
    }

    async findById(id) {
        const result = await this.model.findUnique({ where: { id } });
        if (!result) {
            return null;
        }
        return { ...result, _id: result.id };
    }

    async findAll() {
        const result = await this.model.findMany();
        return result.map(item => ({ ...item, _id: item.id }));
    }

    async findFirst(where, option = {}) {
        where = convertMongoFilterToPrismaFilter(where);
        const result = await this.model.findFirst({
            where,
            ...option
        });
        if (!result) {
            return null;
        }
        return { ...result, _id: result.id };
    }
    async findMany(filter, option = {}) {
        filter = convertMongoFilterToPrismaFilter(filter);
        const result = await this.model.findMany({ where: filter, ...option });
        return result.map(item => ({
            ...item,
            ...(item.id ? { _id: item.id } : {})
        }));
    }

    async update(id, data) {
        // Patch: If id is not provided, try to extract from data._id or data.id
        if (!id) {
            id = data._id || data.id;
        }
        // Accidental _id or id fields should be excluded.
        const { _id, id: dataId, ...updateData } = data;
        const res = await this.model.update({ where: { id }, data: updateData });
        return { ...res, _id: res.id };
    }

    async updateMany(condition, data){
        return await this.model.updateMany({ where: { ...condition }, data: { ...data }});
    }

    async deleteMany(where) {
        return await this.model.deleteMany({ where});
    }

    async delete(id) {
        return await this.model.delete({ where: { id } });
    }
    /**
     * Counts the number of documents in the collection based on the given filter and optional distinct fields.
     *
     * @param {Object} where - The filter conditions to apply (e.g., { status: 'SUBMITTED' }).
     * @param {string|string[]} distinct - A single field or an array of fields to count distinct values for.
     * @returns {Promise<number>} - The count of matching documents (optionally distinct).
     */
    async count(where, distinct) {
        const arr = !Array.isArray(distinct) ? [distinct] : distinct;
        const res = await this.model.findMany({
            where,
            distinct: arr
        });
        return res?.length || 0;
    }
     
    /**
     * Retrieves distinct values for a specified field from the collection based on the given filter.
     *
     * @param {string} field - The field to retrieve distinct values for (e.g., 'applicant.applicantName').
     * @param {Object} filter - The filter conditions to apply (e.g., { status: 'SUBMITTED' }).
     * @returns {Promise<Array>} - An array of distinct values for the specified field.
     */
    async distinct(field, filter = {}) {
        filter = convertMongoFilterToPrismaFilter(filter);
        handleDotNotation(filter);
        // Handle dot notation for nested fields (e.g., "applicant.applicantName")
        let select = {};
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            select[parent] = { select: { [child]: true } };
        } else {
            select[field] = true;
        }

        const apps = await this.model.findMany({ where: filter, select });
        // Flatten nested fields if needed
        const values = field.includes('.')
            ? apps.map(app => {
                const [parent, child] = field.split('.');
                return app[parent]?.[child];
            })
            : apps.map(app => app[field]);
        return [...new Set(values)].filter(v => v !== undefined && v !== null);
    }

    /**
     * Aggregates data based on the provided pipeline stages.
     *
     * @param {Array} pipeline - An array of aggregation stages (e.g., [{ $match: { status: 'SUBMITTED' } }]).
     * @returns {Promise<Array>} - The aggregated results.
     */
    async aggregate(pipeline) {
        // Only support simple $match, $sort, $limit for now
        let query = {};
        let orderBy = undefined;
        let take = undefined;
        let skip = undefined;
        for (const stage of pipeline) {
            if (stage.$match) query = { ...query, ...stage.$match };
            if (stage.$sort) {
                orderBy = mongoSortToPrismaOrderBy(stage.$sort);
            }
            if (stage.$limit) take = stage.$limit;
            if (stage.$skip) skip = stage.$skip;
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
        const apps = await this.model.findMany({
            where: query,
            ...(orderBy !== undefined ? { orderBy } : {}),
            ...(take !== undefined ? { take } : {}),
            ...(skip !== undefined ? { skip } : {})
        });
        return apps.map(app => ({ ...app, _id: app.id }));
    }

}

module.exports = GenericDAO;