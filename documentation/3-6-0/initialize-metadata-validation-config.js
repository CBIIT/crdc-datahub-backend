/**
 * Migration: Initialize METADATA_VALIDATION configuration
 * 
 * Inserts a configuration document with type "METADATA_VALIDATION" and a default
 * batchSize of 1000 into the configuration collection, if one does not already exist.
 * 
 * This configuration controls how many data record IDs are included in each
 * "Validate Metadata Batch" SQS message sent to the validation service.
 * 
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const CONFIGURATION_COLLECTION = 'configuration';
const CONFIG_TYPE = 'METADATA_VALIDATION';
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Main migration function
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, action: string, error?: string}>}
 */
async function initializeMetadataValidationConfig(db) {
    console.log('🔄 Starting METADATA_VALIDATION configuration initialization...');

    const configCollection = db.collection(CONFIGURATION_COLLECTION);

    try {
        // Check if a METADATA_VALIDATION configuration already exists
        const existing = await configCollection.findOne({ type: CONFIG_TYPE });

        if (existing) {
            const currentBatchSize = existing?.keys?.batchSize;
            console.log(`   ⏭️  METADATA_VALIDATION configuration already exists (batchSize: ${currentBatchSize})`);
            return {
                success: true,
                action: 'skipped',
                message: `Configuration already exists with batchSize: ${currentBatchSize}`
            };
        }

        // Insert the default configuration
        const configDocument = {
            type: CONFIG_TYPE,
            keys: {
                batchSize: DEFAULT_BATCH_SIZE
            }
        };

        const result = await configCollection.insertOne(configDocument);
        console.log(`   ✅ Inserted METADATA_VALIDATION configuration with batchSize: ${DEFAULT_BATCH_SIZE} (id: ${result.insertedId})`);

        return {
            success: true,
            action: 'inserted',
            message: `Configuration created with batchSize: ${DEFAULT_BATCH_SIZE}`
        };

    } catch (error) {
        console.error('❌ Failed to initialize METADATA_VALIDATION configuration:', error.message);
        return {
            success: false,
            action: 'failed',
            error: error.message
        };
    }
}

module.exports = {
    initializeMetadataValidationConfig
};
