/**
 * Migration: Rename pendingApplicationID to applicationID in ApprovedStudies
 * 
 * This migration performs two operations:
 * 1. Renames the existing pendingApplicationID field to applicationID
 * 2. For studies without an applicationID, finds the earliest matching submission request
 *    by studyName or studyAbbreviation and sets the applicationID
 * 
 * Usage: This migration is called by the 3.6.0 migration orchestrator
 */

const APPROVED_STUDIES_COLLECTION = 'approvedStudies';
const APPLICATIONS_COLLECTION = 'applications';

/**
 * Main migration function
 * @param {import('mongodb').Db} db - MongoDB database connection
 * @returns {Promise<{success: boolean, renamed: number, populated: number, errors: string[]}>}
 */
async function migrateApplicationID(db) {
    console.log('🔄 Starting applicationID migration...');
    
    const approvedStudiesCollection = db.collection(APPROVED_STUDIES_COLLECTION);
    const applicationsCollection = db.collection(APPLICATIONS_COLLECTION);
    
    const results = {
        success: true,
        renamed: 0,
        populated: 0,
        skipped: 0,
        errors: []
    };
    
    try {
        // Step 1: Rename pendingApplicationID to applicationID for all documents that have it
        console.log('📝 Step 1: Renaming pendingApplicationID to applicationID...');
        const renameResult = await approvedStudiesCollection.updateMany(
            { pendingApplicationID: { $exists: true } },
            { $rename: { 'pendingApplicationID': 'applicationID' } }
        );
        results.renamed = renameResult.modifiedCount;
        console.log(`   ✅ Renamed ${results.renamed} documents`);
        
        // Step 2: Find studies without applicationID and try to populate from applications
        console.log('📝 Step 2: Populating applicationID for studies without one...');
        
        const studiesWithoutApplicationID = await approvedStudiesCollection.find({
            applicationID: { $exists: false }
        }).toArray();
        
        console.log(`   Found ${studiesWithoutApplicationID.length} studies without applicationID`);
        
        for (const study of studiesWithoutApplicationID) {
            try {
                // Find the earliest application matching by studyName or studyAbbreviation
                const matchingApplication = await applicationsCollection.findOne(
                    {
                        $or: [
                            { studyName: study.studyName },
                            { studyAbbreviation: study.studyAbbreviation }
                        ]
                    },
                    {
                        sort: { createdAt: 1 } // Earliest first
                    }
                );
                
                if (matchingApplication) {
                    // Update the study with the application ID
                    await approvedStudiesCollection.updateOne(
                        { _id: study._id },
                        { $set: { applicationID: matchingApplication._id } }
                    );
                    results.populated++;
                    console.log(`   ✅ Populated applicationID for study: ${study.studyName} (${study._id})`);
                } else {
                    // No matching application found - leave field omitted as per requirements
                    results.skipped++;
                    console.log(`   ⏭️  No matching application found for study: ${study.studyName} (${study._id})`);
                }
            } catch (error) {
                const errorMsg = `Failed to process study ${study._id}: ${error.message}`;
                console.error(`   ❌ ${errorMsg}`);
                results.errors.push(errorMsg);
            }
        }
        
        // Summary
        console.log('📊 Migration Summary:');
        console.log(`   - Renamed: ${results.renamed}`);
        console.log(`   - Populated: ${results.populated}`);
        console.log(`   - Skipped (no match): ${results.skipped}`);
        console.log(`   - Errors: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.warn('⚠️  Some documents failed to migrate - see errors above');
            results.success = false;
        } else {
            console.log('✅ applicationID migration completed successfully');
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        results.success = false;
        results.errors.push(error.message);
        return results;
    }
}

module.exports = {
    migrateApplicationID
};

