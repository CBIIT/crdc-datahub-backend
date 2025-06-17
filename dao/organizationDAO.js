const prisma = require("../prisma");
const AbstractDAO = require("./abstractDAO");
const { ORGANIZATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
class ProgramDAO extends AbstractDAO {
    constructor() {
        super(ORGANIZATION_COLLECTION);
    }

}
module.exports = ProgramDAO
