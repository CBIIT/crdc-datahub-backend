const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class BatchDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.BATCH);
    }

    /**
     * Delete batches by filter criteria
     * @param {Object} filter - Filter conditions for deletion
     * @returns {Promise<Object>} - Deletion result
     */
    async deleteByFilter(filter) {
        try {
            return await this.deleteMany(filter);
        } catch (error) {
            console.error('BatchDAO.deleteByFilter failed:', {
                error: error.message,
                filter,
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
            // Since files is a JSON array, we need to fetch multiple batches and filter in JavaScript
            // We'll fetch batches in descending order by displayID to find the latest one first
            // Limit the number of batches to search through for performance
            const batches = await this.model.findMany({
                where: {
                    submissionID: submissionID,
                    type: "data file",
                    status: "Uploaded"
                },
                select: {
                    displayID: true,
                    files: true
                },
                orderBy: {
                    displayID: 'desc'
                },
                take: maxBatches // Limit the number of batches to search
            });
            
            if (!batches || batches.length === 0) {
                return null;
            }
            
            // Search through batches in order (highest displayID first) to find the file
            for (const batch of batches) {
                if (batch.files && Array.isArray(batch.files)) {
                    // Check if this batch contains the file we're looking for
                    const hasFile = batch.files.some(file => 
                        file && 
                        file.fileName === fileName && 
                        file.status === 'Uploaded' // Additional check for file status
                    );
                    
                    if (hasFile) {
                        return batch.displayID;
                    }
                }
            }
            
            // File not found in any batch
            return null;
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