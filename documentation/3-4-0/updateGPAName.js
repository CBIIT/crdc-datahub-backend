/**
 * Migration script to update GPAName field in applications collection
 * Updates GPAName from questionnaireData.study.GPAName when:
 * 1. GPAName is missing/empty at root level, OR
 * 2. GPAName exists but doesn't match the questionnaireData value
 */

async function updateGPAName() {
    console.log("🔄 Starting GPAName migration...");
    
    // Query all applications to check for GPAName mismatches
    const applications = await db.applications.find({}).toArray();
    
    let updatedCount = 0;
    let matchedCount = 0;
    let missingInQuestionnaireCount = 0;
    let failed = [];
    
    for (const application of applications) {
        try {
            // Check if questionnaireData exists
            if (!application.questionnaireData) {
                missingInQuestionnaireCount++;
                continue;
            }
            
            // Parse questionnaireData JSON
            let questionnaire;
            try {
                questionnaire = JSON.parse(application.questionnaireData);
            } catch (parseError) {
                console.error(`❌ Failed to parse questionnaireData for application ${application._id}: ${parseError.message}`);
                failed.push({ 
                    id: application._id, 
                    error: `JSON parse error: ${parseError.message}` 
                });
                continue;
            }
            
            // Check if study object exists
            if (!questionnaire.study) {
                missingInQuestionnaireCount++;
                continue;
            }
            
            // Extract GPAName from study object
            const extractedGPAName = questionnaire.study.GPAName;
            
            // Skip if GPAName is falsy or empty string in questionnaireData
            if (!extractedGPAName || extractedGPAName.trim() === "") {
                missingInQuestionnaireCount++;
                continue;
            }
            
            const trimmedExtractedGPAName = extractedGPAName.trim();
            const currentGPAName = application.GPAName ? application.GPAName.trim() : "";
            
            // Check if update is needed
            let needsUpdate = false;
            let updateReason = "";
            
            if (!application.GPAName) {
                // GPAName is missing or empty at root level
                needsUpdate = true;
                updateReason = "missing/empty at root level";
            } else if (currentGPAName !== trimmedExtractedGPAName) {
                // GPAName exists but doesn't match
                needsUpdate = true;
                updateReason = `mismatch: root="${currentGPAName}" vs questionnaire="${trimmedExtractedGPAName}"`;
            }
            
            if (!needsUpdate) {
                matchedCount++;
                continue;
            }
            
            // Update the application with extracted GPAName
            const result = await db.applications.updateOne(
                { _id: application._id },
                { $set: { GPAName: trimmedExtractedGPAName } }
            );
            
            if (result.modifiedCount === 1) {
                console.log(`✅ Updated application ${application._id} with GPAName: "${trimmedExtractedGPAName}" (${updateReason})`);
                updatedCount++;
            }
            
        } catch (error) {
            console.error(`❌ Failed to process application ${application._id}: ${error.message}`);
            failed.push({ 
                id: application._id, 
                error: error.message 
            });
        }
    }
    
    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 GPAName Migration Summary:");
    console.log(`✅ GPAName updated: ${updatedCount}`);
    console.log(`✅ GPAName matched: ${matchedCount}`);
    console.log(`⚠️  GPAName missing in questionnaire data: ${missingInQuestionnaireCount}`);
    console.log(`❌ Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        console.log("\n❌ Failed applications:");
        failed.forEach(failure => {
            console.log(`   - Application ID: ${failure.id}, Error: ${failure.error}`);
        });
    }
    
    console.log("=".repeat(50));
    console.log("🎉 GPAName migration completed!");
}

// Execute the migration
updateGPAName()
    .then(() => {
        console.log("✅ GPAName migration script completed successfully");
    })
    .catch((error) => {
        console.error("❌ GPAName migration script failed:", error.message);
        process.exit(1);
    });
