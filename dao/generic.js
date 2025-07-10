const prisma = require("../prisma");

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

    async findFirst(where) {
        const result = await this.model.findFirst({ where });
        if (!result) {
            return null;
        }
        return { ...result, _id: result.id };
    }
    async findMany(where, options) {
        const result = await this.model.findMany({ where }, options ? options : {});
        return result.map(item => ({ ...item, _id: item.id }));
    }

    async update(id, data) {
        // Accidental _id or id fields should be excluded.
        const {_id: __, id: _, ...updateData} = data;
        const res = await this.model.update({ where: { id }, data: updateData });
        return { ...res, _id: res.id };
    }

    async updateMany(condition, data){
        return await this.model.updateMany({ where: { ...condition }, data: { ...data }});
    }

    async delete(id) {
        return await this.model.delete({ where: { id } });
    }
}

module.exports = GenericDAO;