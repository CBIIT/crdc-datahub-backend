const prisma = require("../prisma");

class GenericDAO {
    constructor(model) {
        this.model = model;
    }

    async create(data) {
        return await prisma[this.model].create({ data });
    }

    async findById(id) {
        const result = await prisma[this.model].findUnique({ where: { id } });
        if (!result) {
            return null;
        }
        return { ...result, _id: result.id };
    }

    async findAll() {
        const result = await prisma[this.model].findMany();
        return result.map(item => ({ ...item, _id: item.id }));
    }

    async update(id, data) {
        return await prisma[this.model].update({ where: { id }, data });
    }

    async delete(id) {
        return await prisma[this.model].delete({ where: { id } });
    }
}

module.exports = GenericDAO;