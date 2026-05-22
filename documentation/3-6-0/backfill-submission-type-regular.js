/**
 * Migration: set submissionType to Regular for legacy submissions
 *
 * Idempotent: safe to run multiple times. Only updates documents where
 * submissionType is missing or null, and status is submitted or later in the workflow.
 *
 * Usage: Called by the 3.6.0 migration orchestrator (npm run migrate:3.6.0)
 */

const { SUBMISSION_TYPE } = require("../../constants/submission-constants");

const SUBMISSIONS_COLLECTION = "submissions";

const LEGACY_BACKFILL_STATUSES = [
    "Submitted",
    "Released",
    "Completed",
    "Archived",
    "Withdrawn",
    "Rejected",
];

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<{success: boolean, message?: string, matchedCount?: number, modifiedCount?: number, error?: string}>}
 */
async function backfillSubmissionTypeRegular(db) {
    console.log("🔄 Backfilling Submission.submissionType to Regular where missing...");

    const collection = db.collection(SUBMISSIONS_COLLECTION);

    try {
        const filter = {
            status: { $in: LEGACY_BACKFILL_STATUSES },
            $or: [
                { submissionType: { $exists: false } },
                { submissionType: null }
            ],
        };

        const result = await collection.updateMany(filter, {
            $set: { submissionType: SUBMISSION_TYPE.REGULAR },
        });

        console.log(`   ✅ Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
        return {
            success: true,
            message: `Set submissionType to ${SUBMISSION_TYPE.REGULAR} on ${result.modifiedCount} document(s)`,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
        };
    } catch (error) {
        console.error("   ❌ Error backfilling submissionType:", error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    backfillSubmissionTypeRegular,
};
