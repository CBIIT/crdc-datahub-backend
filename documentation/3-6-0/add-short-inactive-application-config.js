/**
 * Migration: Add INACTIVE_NEW_APPLICATION_DAYS configuration entry
 *
 * Inserts or updates the SCHEDULED_JOBS configuration document to include the
 * INACTIVE_NEW_APPLICATION_DAYS key with a default of 30 days if missing.
 *
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const CONFIGURATION_COLLECTION = 'configuration';
const CONFIG_TYPE = 'SCHEDULED_JOBS';
const CONFIG_ID = '8e2d00f4-2ac6-4a0d-a453-733cc218b04f';
const CONFIG_KEY = 'INACTIVE_NEW_APPLICATION_DAYS';
const DEFAULT_DAYS = 30;

async function addShortInactiveApplicationConfig(db) {
  console.log('🔄 Adding INACTIVE_NEW_APPLICATION_DAYS configuration...');
  const configCollection = db.collection(CONFIGURATION_COLLECTION);

  try {
    // Ensure document exists
    await configCollection.updateOne(
      { type: CONFIG_TYPE },
      { $setOnInsert: { _id: CONFIG_ID, type: CONFIG_TYPE } },
      { upsert: true }
    );

    // Set the key if it is missing or null
    const result = await configCollection.updateOne(
      { type: CONFIG_TYPE, [CONFIG_KEY]: { $eq: null } },
      { $set: { [CONFIG_KEY]: DEFAULT_DAYS } }
    );

    if (result.modifiedCount > 0) {
      console.log(`   ✅ Added ${CONFIG_KEY} (${DEFAULT_DAYS}) to ${CONFIG_TYPE} configuration`);
      return { success: true, added: true };
    }

    console.log(`   ℹ️  ${CONFIG_KEY} already present in ${CONFIG_TYPE}, skipping`);
    return { success: true, skipped: true };

  } catch (error) {
    console.error(`   ❌ Error adding ${CONFIG_KEY} configuration:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  addShortInactiveApplicationConfig
};
