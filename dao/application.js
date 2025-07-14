const prisma = require("../prisma");
const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
class ApplicationDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.APPLICATION);
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