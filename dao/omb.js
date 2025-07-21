const prisma = require("../prisma");
const omb_type = "OMB_INFO";
const ERROR = require("../constants/error-constants");
async function getOMBConfiguration() {
    const ombConfig = await prisma.configuration.findFirst({where: {type: omb_type}})
    if (!ombConfig) {
        return null
    }
    return {...ombConfig, _id: ombConfig.id}
}

module.exports = getOMBConfiguration