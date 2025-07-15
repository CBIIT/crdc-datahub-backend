const prisma = require("../prisma");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
class PendingPVDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.PENDING_PVS);
    }
    /**
     * Finds all pending PVs associated with a given submission ID.
     *
     * @param {string} submissionID - The ID of the submission to query.
     * @returns {Promise<Array<Object>>} - A promise that resolves to an array of pending PV records.
     */
    async findBySubmissionID(submissionID) {
        const pendingPVs = await prisma.pendingPVs.findMany({where: {submissionID}});
        return pendingPVs.map(pv => ({...pv, _id: pv.id}))
    }

    async insertOne(submissionID, offendingProperty, value) {
        try {
            const newPendingPV = PendingPVData.createPendingPV(submissionID, offendingProperty, value);
            return await prisma.pendingPVs.create({
                data: newPendingPV,
            });
        } catch (error) {
            console.error(`Error inserting pending PV: ${submissionID}`, error);
        }
    }

}

class PendingPVData {
    constructor(submissionID, offendingProperty, value) {
        this.submissionID = submissionID;
        this.offendingProperty = offendingProperty;
        this.value = value;
        this.createdAt = this.updatedAt = getCurrentTime();
    }
    static createPendingPV(submissionID, offendingProperty, value) {
        return new PendingPVData(submissionID, offendingProperty, value);
    }
}

module.exports = PendingPVDAO