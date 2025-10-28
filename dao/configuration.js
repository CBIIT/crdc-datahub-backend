const prisma = require("../prisma");
const { MODEL_NAME } = require('../constants/db-constants');
const GenericDAO = require("./generic");

class ConfigurationDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.CONFIGURATION);
    }

    async findByType(type) {
        const config = await this.findFirst({type: type});
        return config? {...config, _id: config.id} : null;
    }

    async findManyByType(type) {
        const configs = await this.findMany({type: type});
        return configs.map(c => ({...c, _id: c.id}));
    }
}

module.exports = ConfigurationDAO;