const prisma = require("../prisma");
class PendingPVDAO {
    constructor() {
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