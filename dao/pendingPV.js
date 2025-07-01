const prisma = require("../prisma");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {v4} = require("uuid");
class PendingPVDAO {
    constructor(pendingPVCollection) {
        this.pendingPVCollection = pendingPVCollection;
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
            return await this.pendingPVCollection.insert(newPendingPV);
        } catch (error) {
            console.error(`Error inserting pending PV: ${submissionID}`, error);
        }
    }

}

class PendingPVData {
    constructor(submissionID, offendingProperty, value) {
        this._id = v4();
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