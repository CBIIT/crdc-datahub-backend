const prisma = require("../prisma");
class ApplicationDAO {
    constructor() {
    }
    /**
     * Finds an application associated with a given submission ID.
     *
     * @param {string} applicationID - The ID of the submission to query.
     * @returns {Promise<Application>} - A promise that resolves to an array of pending PV records.
     */
    // TODO this should be removed after generic dao created
    async findByID(applicationID) {
        const res = await prisma.application.findUnique({where: {id: applicationID}});
        return res ? { ...res, _id: res.id } : null;
    }
}

module.exports = ApplicationDAO