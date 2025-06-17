const prisma = require("../prisma");

const modelMap = {
    user: prisma.user
};
class AbstractDAO {

    constructor(collectionName) {
        this.collection = modelMap[collectionName];
    }

    async findById(id) {
        const dao = await this.collection.findUnique({where: {id: id}})
        if (!dao) {
            return null
        }
        return {...dao, _id: dao.id}
    }
}
module.exports = AbstractDAO