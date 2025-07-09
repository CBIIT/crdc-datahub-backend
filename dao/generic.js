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

    async findFirst(filter) {
        const result = await this.model.findFirst({ where: filter });
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
        return await this.model.update({ where: { id }, data });
    }

    async delete(id) {
        return await this.model.delete({ where: { id } });
    }
}

module.exports = GenericDAO;