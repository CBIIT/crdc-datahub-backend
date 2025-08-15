const prisma = require("../prisma");
const {convertMongoFilterToPrismaFilter} = require('./utils/orm-converter');

class GenericDAO {
    constructor(modelName) {
        this.model = prisma[modelName];
    }

    async create(data) {
        try {
            const res = await this.model.create({ data });
            return { ...res, _id: res.id };
        } catch (error) {
            console.error(`GenericDAO.create failed for ${this.model.name}:`, {
                error: error.message,
                dataType: typeof data,
                dataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
                dataLength: Array.isArray(data) ? data.length : null,
                stack: error.stack
            });
            throw new Error(`Failed to create ${this.model.name}`);
        }
    }

    async createMany(data) {
        try {
            return await this.model.createMany({data});
        } catch (error) {
            console.error(`GenericDAO.createMany failed for ${this.model.name}:`, {
                error: error.message,
                dataCount: Array.isArray(data) ? data.length : 0,
                dataType: typeof data,
                stack: error.stack
            });
            throw new Error(`Failed to create many ${this.model.name}`);
        }
    }

    async findById(id) {
        try {
            const result = await this.model.findUnique({ where: { id } });
            if (!result) {
                return null;
            }
            return { ...result, _id: result.id };
        } catch (error) {
            console.error(`GenericDAO.findById failed for ${this.model.name}:`, {
                error: error.message,
                id,
                stack: error.stack
            });
            throw new Error(`Failed to find ${this.model.name} by ID`);
        }
    }

    async findAll() {
        try {
            const result = await this.model.findMany();
            return result.map(item => ({ ...item, _id: item.id }));
        } catch (error) {
            console.error(`GenericDAO.findAll failed for ${this.model.name}:`, {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to find all ${this.model.name}`);
        }
    }

    async findFirst(where, option = {}) {
        try {
            where = convertMongoFilterToPrismaFilter(where);
            const result = await this.model.findFirst({
                where,
                ...option
            });
            if (!result) {
                return null;
            }
            return { ...result, _id: result.id };
        } catch (error) {
            console.error(`GenericDAO.findFirst failed for ${this.model.name}:`, {
                error: error.message,
                where: JSON.stringify(where),
                options: JSON.stringify(option),
                stack: error.stack
            });
            throw new Error(`Failed to find first ${this.model.name}`);
        }
    }

    async findMany(filter, option = {}) {
        try {
            filter = convertMongoFilterToPrismaFilter(filter);
            const result = await this.model.findMany({ where: filter, ...option });
            return result.map(item => ({
                ...item,
                ...(item.id ? { _id: item.id } : {})
            }));
        } catch (error) {
            console.error(`GenericDAO.findMany failed for ${this.model.name}:`, {
                error: error.message,
                filter: JSON.stringify(filter),
                options: JSON.stringify(option),
                stack: error.stack
            });
            throw new Error(`Failed to find many ${this.model.name}`);
        }
    }

    async update(id, data) {
        try {
            // Patch: If id is not provided, try to extract from data._id or data.id
            if (!id) {
                id = data._id || data.id;
            }
            // Accidental _id or id fields should be excluded.
            const { _id, id: dataId, ...updateData } = data;
            const res = await this.model.update({ where: { id }, data: updateData });
            return { ...res, _id: res.id };
        } catch (error) {
            console.error(`GenericDAO.update failed for ${this.model.name}:`, {
                error: error.message,
                id,
                updateDataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
                stack: error.stack
            });
            throw new Error(`Failed to update ${this.model.name}`);
        }
    }

    async updateMany(condition, data){
        try {
            return await this.model.updateMany({ where: { ...condition }, data: { ...data }});
        } catch (error) {
            console.error(`GenericDAO.updateMany failed for ${this.model.name}:`, {
                error: error.message,
                conditionKeys: condition && typeof condition === 'object' ? Object.keys(condition) : null,
                dataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
                stack: error.stack
            });
            throw new Error(`Failed to update many ${this.model.name}`);
        }
    }

    async deleteMany(where) {
        try {
            return await this.model.deleteMany({ where});
        } catch (error) {
            console.error(`GenericDAO.deleteMany failed for ${this.model.name}:`, {
                error: error.message,
                where: JSON.stringify(where),
                stack: error.stack
            });
            throw new Error(`Failed to delete many ${this.model.name}`);
        }
    }

    async delete(id) {
        try {
            return await this.model.delete({ where: { id } });
        } catch (error) {
            console.error(`GenericDAO.delete failed for ${this.model.name}:`, {
                error: error.message,
                id,
                stack: error.stack
            });
            throw new Error(`Failed to delete ${this.model.name}`);
        }
    }

    /**
     * Counts the number of documents in the collection based on the given filter.
     *
     * @param {Object} where - The filter conditions to apply (e.g., { status: 'SUBMITTED' }).
     * @returns {Promise<number>} - The count of matching documents.
     */
    async count(where) {
        try {
            return await this.model.count({ where });
        } catch (error) {
            console.error(`GenericDAO.count failed for ${this.model.name}:`, {
                error: error.message,
                where: JSON.stringify(where),
                stack: error.stack
            });
            throw new Error(`Failed to count ${this.model.name}`);
        }
    }
}

module.exports = GenericDAO;