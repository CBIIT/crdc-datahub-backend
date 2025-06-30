const prisma = require("../prisma");
class PendingPVDAO {
    constructor() {
    }
    /**
     * Finds all pending PVs associated with a given submission ID.
     *
     * @param {string} submissionID - The ID of the submission to query.
     * @returns {Promise<Array<Object>>} - A promise that resolves to an array of pending PV records.
     */
    async findBySubmissionID(submissionID) {
        return await prisma.pendingPVs.findMany({where: {submissionID}});
    }
}
module.exports = PendingPVDAO