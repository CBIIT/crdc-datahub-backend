const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class BatchDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.BATCH);
    }

    /**
     * Delete batches by a submission
     * @param {Object} submissionID - submissionID
     * @returns {Promise<Object>} - Deletion result
     */
    async deleteBatchesBySubmissionID(submissionID) {

        try {
            if (submissionID) {
                const res = await this.deleteMany({submissionID: submissionID});
                console.log(`deleteBySubmissionID submissionID: ${JSON.stringify(submissionID)}, ${JSON.stringify(res)}`);
                return res;
            }
        } catch (error) {
            console.error('BatchDAO.deleteBySubmissionID failed:', {
                error: error.message,
                submissionID,
                stack: error.stack
            });
            throw new Error(`Failed to delete batches`);
        }
    }

    /**
     * Find batches by submission ID and status
     * @param {string} submissionID - Submission ID to filter by
     * @param {string} status - Status to filter by
     * @returns {Promise<Array>} - Array of matching batches
     */
    async findByStatus(submissionID, status) {
        try {
            const result = await this.model.findFirst({
                where: {
                    submissionID: submissionID,
                    status: status
                }
            });
            
            if (!result) {
                return [];
            }
            
            return [{ ...result, _id: result.id }];
        } catch (error) {
            console.error('BatchDAO.findByStatus failed:', {
                error: error.message,
                submissionID,
                status,
                stack: error.stack
            });
            throw new Error(`Failed to find batch by status`);
        }
    }

    /**
     * Get the next display ID for a submission
     * @param {string} submissionID - Submission ID to get next display ID for
     * @returns {Promise<number>} - Next display ID
     */
    async getNextDisplayID(submissionID) {
        try {
            const count = await this.model.count({
                where: {
                    submissionID: submissionID
                }
            });
            
            return count + 1;
        } catch (error) {
            console.error('BatchDAO.getNextDisplayID failed:', {
                error: error.message,
                submissionID,
                stack: error.stack
            });
            throw new Error(`Failed to get next display ID`);
        }
    }

    /**
     * Get the latest batch ID for a specific file in a submission
     * @param {string} submissionID - Submission ID
     * @param {string} fileName - File name to search for
     * @param {number} maxBatches - Maximum number of batches to search through (default: 10)
     * @returns {Promise<number|null>} - Latest batch display ID or null if not found
     */
    async getLastFileBatchID(submissionID, fileName, maxBatches = 10) {
        try {
            // Use Prisma's array operations for MongoDB-optimized queries
            // This eliminates the need to fetch and iterate through batches in JavaScript
            const result = await this.model.findFirst({
                where: {
                    submissionID: submissionID,
                    type: "data file",
                    status: "Uploaded",
                    // Prisma MongoDB array operator to check if files array contains matching object
                    files: {
                        has: {
                            fileName: fileName,
                            status: 'Uploaded'
                        }
                    }
                },
                select: {
                    displayID: true
                },
                orderBy: {
                    displayID: 'desc'
                }
            });
            
            return result ? result.displayID : null;
        } catch (error) {
            console.error('BatchDAO.getLastFileBatchID failed:', {
                error: error.message,
                submissionID,
                fileName,
                maxBatches,
                stack: error.stack
            });
            throw new Error(`Failed to get last file batch ID`);
        }
    }


}

module.exports = BatchDAO