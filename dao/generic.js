const prisma = require("../prisma");
const {convertIdFields, convertMongoFilterToPrismaFilter} = require('./utils/orm-converter');

class GenericDAO {
    constructor(modelName) {
        this.model = prisma[modelName];
    }

    async create(data) {
        return await this.model.create({ data: data });
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

    async delete(id) {
        return await this.model.delete({ where: { id } });
    }
}

module.exports = GenericDAO;