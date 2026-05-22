/**
 * Migration: Initialize CHATBOT configuration entry
 *
 * Inserts a configuration document with type "CHATBOT"
 * and keys.enabled false (default) if one does not already exist.
 * If the entry already exists, it is not modified.
 *
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const CONFIGURATION_COLLECTION = 'configuration';
const CONFIG_TYPE = 'CHATBOT';
const CONFIG_ID = 'f4a8c2d1-9e3b-4f6a-8c7d-1b2e3f4a5b6c';

/**
 * Add CHATBOT configuration if missing
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, added?: boolean, skipped?: boolean, error?: string}>}
 */
async function addChatbotEnabledConfig(db) {
    console.log('🔄 Adding CHATBOT configuration...');

    const configCollection = db.collection(CONFIGURATION_COLLECTION);

    try {
        const upsertResult = await configCollection.updateOne(
            { type: CONFIG_TYPE },
            {
                $setOnInsert: {
                    _id: CONFIG_ID,
                    type: CONFIG_TYPE,
                    keys: { enabled: false }
                }
            },
            { upsert: true }
        );

        if (upsertResult.upsertedCount > 0) {
            console.log(`   ✅ Inserted ${CONFIG_TYPE} configuration (keys.enabled: false)`);
            return { success: true, added: true };
        }
        console.log(`   ℹ️  ${CONFIG_TYPE} configuration already exists, skipping`);
        return { success: true, skipped: true };
    } catch (error) {
        console.error(`   ❌ Error adding ${CONFIG_TYPE} configuration:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    addChatbotEnabledConfig
};
