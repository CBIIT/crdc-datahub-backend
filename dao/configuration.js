const prisma = require("../prisma");

class ConfigurationDAO {

    async findByType(type) {
        const config = await prisma.configuration.findFirst({where: {type: type}});
        return config? {...config, _id: config.id} : null;
    }

    async findManyByType(type) {
        const configs = await prisma.configuration.findMany({where: {type: type}});
        return configs.map(c => ({...c, _id: c.id}));
    }
}

module.exports = ConfigurationDAO;