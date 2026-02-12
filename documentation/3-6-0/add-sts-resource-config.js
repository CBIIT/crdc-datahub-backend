/**
 * Migration: Add STS_RESOURCE configuration entry
 *
 * Reads the tier from the configuration collection
 * If tier is "prod", inserts STS_RESOURCE with prod URL; otherwise uses QA URL.
 * Skips insertion if an entry with type STS_RESOURCE already exists.
 *
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const CONFIGURATION_COLLECTION = 'configuration';
const STS_ENTRY_BASE = {
    _id: '1ef37619-4225-46bd-b773-4f2b1ec63000',
    type: 'STS_RESOURCE'
}
const STS_ENTRY_PROD = {
    ...STS_ENTRY_BASE,
    keys: {
        sts_api_all_url_v2: 'https://sts.cancer.gov/v2/terms/model-pvs',
        sts_api_one_url_v2: 'https://sts.cancer.gov/v2/terms/model-pvs/{model}/{property}?version={version}'
    }
};
const STS_ENTRY_NON_PROD = {
    ...STS_ENTRY_BASE,
    keys: {
        sts_api_all_url_v2: 'https://sts-qa.cancer.gov/v2/terms/model-pvs',
        sts_api_one_url_v2: 'https://sts-qa.cancer.gov/v2/terms/model-pvs/{model}/{property}?version={version}'
    }
};

/**
 * Add STS_RESOURCE configuration if not already present
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, added?: boolean, skipped?: boolean, error?: string}>}
 */
async function addStsResourceConfig(db) {
    console.log('🔄 Adding STS_RESOURCE configuration...');

    const configCollection = db.collection(CONFIGURATION_COLLECTION);

    try {
        // Check if STS_RESOURCE entry already exists (by type, not ID)
        const existing = await configCollection.findOne({ type: 'STS_RESOURCE' });
        if (existing) {
            console.log('   ℹ️  STS_RESOURCE configuration already exists, skipping');
            return { success: true, skipped: true };
        }

        // Determine tier from configuration
        const tierDoc = await configCollection.findOne({ type: 'TIER' });
        const tier = tierDoc?.keys?.tier;
        const isProd = tier === 'prod';

        const entry = isProd ? STS_ENTRY_PROD : STS_ENTRY_NON_PROD;
        await configCollection.insertOne(entry);

        console.log(`   ✅ Added STS_RESOURCE configuration (tier: ${tier ?? 'unknown'}, url: ${entry.keys.sts_api_all_url_v2})`);
        return { success: true, added: true };
    } catch (error) {
        console.error('   ❌ Error adding STS_RESOURCE configuration:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    addStsResourceConfig
};
