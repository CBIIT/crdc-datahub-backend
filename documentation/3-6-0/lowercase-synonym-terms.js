/**
 * Migration: Lowercase synonym_term on synonyms documents that have a string synonym_term
 *
 * Normalizes synonym_term for consistent lookup and indexing. Idempotent: safe
 * to run multiple times (already-lowercase values are unchanged). Documents without
 * synonym_term or with a non-string synonym_term are skipped (avoids nulling missing
 * fields or failing $toLower on wrong types).
 *
 * Requires MongoDB 4.2+ (aggregation pipeline update).
 *
 * Usage: Called by the 3.6.0 migration orchestrator (npm run migrate:3.6.0)
 */

const SYNONYMS_COLLECTION = "synonyms";

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<{success: boolean, matchedCount?: number, modifiedCount?: number, error?: string}>}
 */
async function lowercaseSynonymTerms(db) {
    console.log("🔄 Lowercasing synonym_term in synonyms collection...");

    const collection = db.collection(SYNONYMS_COLLECTION);

    try {
        const filter = {
            synonym_term: { $exists: true, $type: "string" },
        };
        const result = await collection.updateMany(filter, [
            { $set: { synonym_term: { $toLower: "$synonym_term" } } },
        ]);

        console.log(`   ✅ Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
        return {
            success: true,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
        };
    } catch (error) {
        console.error("   ❌ Error lowercasing synonym_term:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    lowercaseSynonymTerms,
};
