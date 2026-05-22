/**
 * Migration: Set ApprovedStudy.status to Active where missing
 *
 * Idempotent: safe to run multiple times. Only updates documents where `status`
 * is absent or null in the approvedStudies collection (Prisma @@map).
 *
 * Usage: Called by the 3.6.0 migration orchestrator (npm run migrate:3.6.0)
 */

const APPROVED_STUDIES_COLLECTION = "approvedStudies";
const STATUS_ACTIVE = "Active";

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<{success: boolean, message?: string, matchedCount?: number, modifiedCount?: number, error?: string}>}
 */
async function backfillApprovedStudyStatus(db) {
    console.log("🔄 Backfilling ApprovedStudy.status where missing...");

    const collection = db.collection(APPROVED_STUDIES_COLLECTION);

    try {
        const result = await collection.updateMany(
            {
                $or: [{ status: { $exists: false } }, { status: null }],
            },
            { $set: { status: STATUS_ACTIVE } }
        );

        console.log(`   ✅ Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
        return {
            success: true,
            message: `Set status to ${STATUS_ACTIVE} on ${result.modifiedCount} document(s)`,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
        };
    } catch (error) {
        console.error("   ❌ Error backfilling ApprovedStudy.status:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    backfillApprovedStudyStatus,
};
