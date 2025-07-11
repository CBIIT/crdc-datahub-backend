const prisma = require("../prisma");

class GenericDAO {
    constructor(modelName) {
        this.model = prisma[modelName];
    }

    async create(data) {
        return await this.model.create({ data });
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
    async findMany(where) {
        const result = await this.model.findMany({ where });
        return result.map(item => ({ ...item, _id: item.id }));
    }

    async update(id, data) {
        // Accidental _id or id fields should be excluded.
        const {_id: __, id: _, ...updateData} = data;
        const res = await this.model.update({ where: { id }, data: updateData });
        return { ...res, _id: res.id };
    }

    async delete(id) {
        return await this.model.delete({ where: { id } });
    }
}

module.exports = GenericDAO;