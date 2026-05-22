/**
 * Migration: Create propertyPVs collection
 *
 * Creates the propertyPVs MongoDB collection if it does not exist.
 * Idempotent: safe to re-run (MongoDB error code 48 = namespace exists).
 *
 * Usage: Called by the 3.6.0 migration orchestrator
 */

const COLLECTION_NAME = 'propertyPVs';

/**
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, created?: boolean, skipped?: boolean, error?: string}>}
 */
async function createPropertyPVsCollection(db) {
    console.log('🔄 Creating propertyPVs collection...');

    try {
        await db.createCollection(COLLECTION_NAME);
        console.log('   ✅ propertyPVs collection created');
        return { success: true, created: true };
    } catch (error) {
        if (error.code === 48) {
            console.log('   ℹ️  propertyPVs collection already exists');
            return { success: true, skipped: true };
        }
        console.error('   ❌ Error creating propertyPVs collection:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    createPropertyPVsCollection
};
