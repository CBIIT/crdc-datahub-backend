/**
 * Migration: Add STS_RESOURCE configuration entry
 *
 * Reads the tier from the configuration collection to determine whether to use prod or non-prod URLs.
 * If an STS_RESOURCE entry already exists, insert the url keys if they are missing.
 * If no STS_RESOURCE entry exists, inserts a new one.
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
 * Add STS_RESOURCE configuration, only adding missing keys
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, added?: boolean, skipped?: boolean, updated?: boolean, error?: string}>}
 */
async function addStsResourceConfig(db) {
    console.log('🔄 Adding STS_RESOURCE configuration...');

    const configCollection = db.collection(CONFIGURATION_COLLECTION);

    try {
        // Determine tier from configuration
        const tierDoc = await configCollection.findOne({ type: 'TIER' });
        const tier = tierDoc?.keys?.tier;
        // defaults to non-prod if tier is not found
        const isProd = tier === 'prod';

        const entry = isProd ? STS_ENTRY_PROD : STS_ENTRY_NON_PROD;

        // Insert an STS_RESOURCE document if one does not already exist
        const upsertResult = await configCollection.updateOne(
            { type: 'STS_RESOURCE' },
            { $setOnInsert: { _id: STS_ENTRY_BASE._id, type: STS_ENTRY_BASE.type } },
            { upsert: true }
        );

        // Insert keys if they are missing or null
        const addedKeys = [];
        for (const [key, value] of Object.entries(entry.keys)) {
            const result = await configCollection.updateOne(
                { type: 'STS_RESOURCE', [`keys.${key}`]: { $eq: null } },
                { $set: { [`keys.${key}`]: value } }
            );
            if (result.modifiedCount > 0) addedKeys.push(key);
        }

        if (upsertResult.upsertedCount > 0) {
            console.log(`   ✅ Inserted STS_RESOURCE configuration (tier: ${tier ?? 'unknown'}, url: ${entry.keys.sts_api_all_url_v2})`);
            return { success: true, added: true };
        } else if (addedKeys.length > 0) {
            console.log(`   ✅ Added missing keys to STS_RESOURCE configuration: ${addedKeys.join(', ')}`);
            return { success: true, updated: true };
        } else {
            console.log('   ℹ️  STS_RESOURCE configuration already has all required keys, skipping');
            return { success: true, skipped: true };
        }
    } catch (error) {
        console.error('   ❌ Error adding STS_RESOURCE configuration:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    addStsResourceConfig
};
