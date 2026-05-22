/**
 * Migration: Initialize METADATA_VALIDATION_BATCH_SIZE configuration entry
 *
 * Inserts a configuration document with type "METADATA_VALIDATION_BATCH_SIZE"
 * and size 1000 (default) if one does not already exist.
 * If the entry already exists, it is not modified.
 *
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const CONFIGURATION_COLLECTION = 'configuration';
const CONFIG_TYPE = 'METADATA_VALIDATION_BATCH_SIZE';
const CONFIG_ID = 'a70b9586-1b4a-4102-a2a4-fa6d66cb0f1d';
const DEFAULT_SIZE = 1000;

/**
 * Add METADATA_VALIDATION_BATCH_SIZE configuration if missing
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, added?: boolean, skipped?: boolean, error?: string}>}
 */
async function initMetadataValidationBatchSize(db) {
    console.log('🔄 Adding METADATA_VALIDATION_BATCH_SIZE configuration...');

    const configCollection = db.collection(CONFIGURATION_COLLECTION);

    try {
        const upsertResult = await configCollection.updateOne(
            { type: CONFIG_TYPE },
            { $setOnInsert: { _id: CONFIG_ID, type: CONFIG_TYPE, size: DEFAULT_SIZE } },
            { upsert: true }
        );

        if (upsertResult.upsertedCount > 0) {
            console.log(`   ✅ Inserted ${CONFIG_TYPE} configuration (size: ${DEFAULT_SIZE})`);
            return { success: true, added: true };
        } else {
            console.log(`   ℹ️  ${CONFIG_TYPE} configuration already exists, skipping`);
            return { success: true, skipped: true };
        }
    } catch (error) {
        console.error(`   ❌ Error adding ${CONFIG_TYPE} configuration:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initMetadataValidationBatchSize
};
