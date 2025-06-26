const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
class PendingPVDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.PENDING_PVS);
    }
    async findBySubmissionID(submissionID) {
         const pendingPVs = await prisma.pendingPVs.findMany({where: {submissionID}})
         if (!pendingPVs) {
            return null
        }
        return pendingPVs;
    }
}
module.exports = PendingPVDAO