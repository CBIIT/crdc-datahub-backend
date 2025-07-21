const prisma = require("../prisma");
const {OMB_INFO} = require('../constants/db-constants');
async function getOMBConfiguration() {
    const ombConfig = await prisma.configuration.findFirst({where: {type: OMB_INFO}})
    if (!ombConfig) {
        return null;
    }
    return {...ombConfig, _id: ombConfig.id}
}

module.exports = getOMBConfiguration