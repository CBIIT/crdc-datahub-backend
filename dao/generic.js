const prisma = require("../prisma");
const {convertMongoFilterToPrismaFilter} = require('./utils/orm-converter');

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
    async findMany(filter) {
        filter = convertMongoFilterToPrismaFilter(filter);
        const result = await this.model.findMany({ where: filter });
        return result.map(item => ({ ...item, _id: item.id }));
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
        return await this.model.count({
            where,
            distinct: arr,
        });
    }
}

module.exports = GenericDAO;