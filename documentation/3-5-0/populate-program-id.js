/**
 * Program ID Population Migration
 * Version: 3.5.0
 * Description: Populates programID in approved studies using programs' studies arrays,
 *              assigns orphan studies to NA program, and removes studies arrays from programs
 * 
 * Migration Process:
 *   1. Iterate through programs that have studies arrays
 *   2. Update each study in the studies array with the corresponding program ID
 *      - Skip studies with null/undefined IDs and log warnings
 *   3. Assign any remaining studies without programID to the NA program
 *      - Skip studies with null/undefined IDs and validate NA program ID
 *   4. Remove studies arrays from all programs for cleanup
 * 
 * Usage: 
 *   - As Node.js module: const migration = require('./populate-program-id');
 *     const result = await migration.populateProgramIDInApprovedStudies(db);
 *   - Direct execution: node populate-program-id.js
 */

/**
 * Populate programID in approved studies based on existing relationships
 */
async function populateProgramIDInApprovedStudies(db) {
    console.log("🔄 Starting Program ID population migration...");
    
    const startTime = new Date();
    const stats = {
        totalPrograms: 0,
        studiesFromPrograms: 0,
        orphanStudiesToNA: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        studiesArrayRemoved: false
    };
    
    try {
        // Step 1: Ensure NA program exists
        const naProgram = await ensureNAProgramExists(db);
        if (!naProgram.success) {
            console.error("❌ Migration aborted: NA program is required but not found");
            return {
                success: false,
                error: naProgram.error || "NA program not found",
                stats: stats
            };
        }
        
        // Step 2: Process programs with studies arrays
        console.log("📋 Processing programs with studies arrays...");
        const programs = await db.collection('organization').find({ 
            studies: { $exists: true, $ne: [] } 
        }).toArray();
        
        stats.totalPrograms = programs.length;
        
        for (const program of programs) {
            try {
                if (!program.studies || program.studies.length === 0) {
                    continue;
                }
                
                console.log(`📂 Processing program ${program.name} with ${program.studies.length} studies`);
                
                // Update each study in the program's studies array
                for (const study of program.studies) {
                    const studyId = study?._id || study?.id;
                    
                    // Skip if studyId is null or undefined
                    if (!studyId) {
                        console.warn(`⚠️  Skipping study with null/undefined ID in program ${program.name}:`, study?._id || study?.id);
                        stats.errors++;
                        continue;
                    }
                    
                    try {
                        const updateResult = await db.collection('approvedStudies').updateOne(
                            { 
                                _id: studyId,
                                programID: { $ne: program._id }
                            },
                            { 
                                $set: { 
                                    programID: program._id,
                                    updatedAt: new Date()
                                }
                            }
                        );
                        
                        if (updateResult.modifiedCount === 1) {
                            stats.updated++;
                            stats.studiesFromPrograms++;
                        } else {
                            stats.skipped++;
                        }
                    } catch (error) {
                        console.error(`❌ Error updating study ${studyId}: ` + error.message);
                        stats.errors++;
                    }
                }
            } catch (error) {
                console.error(`❌ Error processing program ${program._id}: ` + error.message);
                stats.errors++;
            }
        }
        
        // Step 3: Handle orphan studies (those without programID after program processing)
        console.log("🔍 Processing orphan studies (assigning to NA program)...");
        const orphanStudies = await db.collection('approvedStudies').find({
            $or: [
                { programID: { $exists: false } },
                { programID: null }
            ]
        }).toArray();
        
        for (const study of orphanStudies) {
            try {
                // Skip if study has null or undefined _id
                if (!study._id) {
                    console.warn(`⚠️  Skipping orphan study with null/undefined _id:`, study);
                    stats.errors++;
                    continue;
                }
                
                // Validate that we have a valid NA program ID
                if (!naProgram.programId) {
                    throw new Error("NA program ID is null or undefined");
                }
                
                const updateResult = await db.collection('approvedStudies').updateOne(
                    { _id: study._id },
                    { 
                        $set: { 
                            programID: naProgram.programId,
                            updatedAt: new Date()
                        }
                    }
                );
                
                if (updateResult.modifiedCount === 1) {
                    stats.updated++;
                    stats.orphanStudiesToNA++;
                } else {
                    stats.skipped++;
                }
            } catch (error) {
                console.error(`❌ Error updating orphan study ${study._id}: ` + error.message);
                stats.errors++;
            }
        }
        
        // Step 4: Clean up studies arrays from all programs
        console.log("🧹 Removing studies arrays from all programs...");
        const cleanupResult = await db.collection('organization').updateMany(
            { studies: { $exists: true } },
            { $unset: { studies: "" } }
        );
        
        if (cleanupResult.modifiedCount > 0) {
            stats.studiesArrayRemoved = true;
            console.log(`✅ Removed studies array from ${cleanupResult.modifiedCount} programs`);
        }
        
        return generateProgramIDMigrationResult(stats, startTime);
        
    } catch (error) {
        console.error("❌ Migration failed: " + error.message);
        return {
            success: false,
            error: error.message,
            stats: stats
        };
    }
}

/**
 * Ensure the "NA" program exists for fallback cases
 */
async function ensureNAProgramExists(db) {
    try {
        const naProgram = await db.collection('organization').findOne({ name: "NA" });
        if (!naProgram) {
            console.error("❌ NA program not found - please create it manually before running this migration");
            return { success: false, created: false, error: "NA program not found" };
        } else {
            return { success: true, created: false, programId: naProgram._id };
        }
    } catch (error) {
        console.error("❌ Error checking for NA program: " + error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Updates the programID for a single approved study (legacy function, not used in new approach)
 */
async function updateStudyProgramID(db, study) {
    try {
        // Validate study has a valid _id
        if (!study || !study._id) {
            throw new Error("Study is null or missing _id field");
        }
        
        let targetProgramID = null;
        let updateReason = "";
        
        // Strategy 1: If study has programName, find matching program
        if (study.programName && study.programName.trim() !== "") {
            const matchingProgram = await db.collection('organization').findOne({
                name: { $regex: new RegExp("^" + study.programName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") }
            });
            
            if (matchingProgram) {
                targetProgramID = matchingProgram._id;
                updateReason = "Found program by name: " + study.programName;
            }
        }
        
        // Strategy 2: If no program found by name, use NA program
        if (!targetProgramID) {
            const naProgram = await db.collection('organization').findOne({ name: "NA" });
            if (naProgram) {
                targetProgramID = naProgram._id;
                updateReason = study.programName ? 
                    "No program found for name '" + study.programName + "', using NA program" :
                    "No program name specified, using NA program";
            } else {
                throw new Error("NA program not found, cannot proceed");
            }
        }
        
        // Update the study with the programID only if it's different
        const updateResult = await db.collection('approvedStudies').updateOne(
            { 
                _id: study._id,
                programID: { $ne: targetProgramID }  // Only update if different
            },
            { 
                $set: { 
                    programID: targetProgramID,
                    updatedAt: new Date()
                }
            }
        );
        
        if (updateResult.modifiedCount === 1) {
            return { updated: true, programID: targetProgramID };
        } else {
            return { updated: false, reason: "No update needed - programID already correct" };
        }
        
    } catch (error) {
        throw error;
    }
}

/**
 * Generate the program ID migration result
 */
function generateProgramIDMigrationResult(stats, startTime) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    const success = stats.errors === 0;
    
    if (success) {
        console.log(`✅ Program ID migration completed successfully (${duration}ms)`);
        console.log(`   📋 ${stats.totalPrograms} programs processed`);
        console.log(`   📑 ${stats.studiesFromPrograms} studies updated from program arrays`);
        console.log(`   🔍 ${stats.orphanStudiesToNA} orphan studies assigned to NA program`);
        console.log(`   ⏭️  ${stats.skipped} studies skipped (no update needed)`);
        console.log(`   🧹 Studies arrays removed from programs: ${stats.studiesArrayRemoved}`);
    } else {
        console.error(`❌ Program ID migration completed with ${stats.errors} errors (${duration}ms)`);
        console.log(`   📋 ${stats.totalPrograms} programs processed`);
        console.log(`   📑 ${stats.studiesFromPrograms} studies updated from program arrays`);
        console.log(`   🔍 ${stats.orphanStudiesToNA} orphan studies assigned to NA program`);
        console.log(`   ⏭️  ${stats.skipped} studies skipped`);
        console.log(`   🧹 Studies arrays removed from programs: ${stats.studiesArrayRemoved}`);
    }
    
    return {
        success: success,
        duration: duration,
        stats: stats,
        message: "Program ID population completed"
    };
}

/**
 * Verification function to check migration results
 */
async function verifyProgramIDMigration(db) {
    try {
        const verification = {
            studiesWithoutProgramID: 0,
            studiesWithProgramID: 0,
            studiesWithInvalidProgramID: 0,
            validProgramsInStudies: {},
            programsStillWithStudiesArray: 0,
            totalStudies: 0
        };
        
        // Count studies without programID
        verification.studiesWithoutProgramID = await db.collection('approvedStudies').countDocuments({
            $or: [
                { programID: { $exists: false } },
                { programID: null }
            ]
        });
        
        // Count studies with programID
        verification.studiesWithProgramID = await db.collection('approvedStudies').countDocuments({
            programID: { $exists: true, $ne: null }
        });
        
        // Count total studies
        verification.totalStudies = await db.collection('approvedStudies').countDocuments({});
        
        // Count programs that still have studies arrays
        verification.programsStillWithStudiesArray = await db.collection('organization').countDocuments({
            studies: { $exists: true }
        });
        
        // Check for studies with invalid programIDs (programs that don't exist)
        const studiesWithProgramID = await db.collection('approvedStudies').find({
            programID: { $exists: true, $ne: null }
        }).toArray();
        
        for (const study of studiesWithProgramID) {
            // Skip studies with null or undefined _id
            if (!study._id) {
                console.warn("⚠️  Skipping study in verification with null/undefined _id:", study);
                verification.studiesWithInvalidProgramID++;
                continue;
            }
            
            const program = await db.collection('organization').findOne({ _id: study.programID });
            if (!program) {
                verification.studiesWithInvalidProgramID++;
                console.warn("⚠️  Study " + study._id + " references non-existent program: " + study.programID);
            } else {
                // Count how many studies reference each valid program
                if (!verification.validProgramsInStudies[study.programID]) {
                    verification.validProgramsInStudies[study.programID] = {
                        programName: program.name,
                        studyCount: 0
                    };
                }
                verification.validProgramsInStudies[study.programID].studyCount++;
            }
        }
        
        const isComplete = verification.studiesWithoutProgramID === 0 && 
                          verification.studiesWithInvalidProgramID === 0 &&
                          verification.programsStillWithStudiesArray === 0;
        
        if (!isComplete) {
            console.warn(`⚠️  Program ID verification issues:`);
            if (verification.studiesWithoutProgramID > 0) {
                console.warn(`   📑 ${verification.studiesWithoutProgramID} studies lack programID`);
            }
            if (verification.studiesWithInvalidProgramID > 0) {
                console.warn(`   ❌ ${verification.studiesWithInvalidProgramID} studies have invalid programIDs`);
            }
            if (verification.programsStillWithStudiesArray > 0) {
                console.warn(`   🧹 ${verification.programsStillWithStudiesArray} programs still have studies arrays`);
            }
        } else {
            console.log(`✅ Program ID migration verification successful!`);
            console.log(`   📑 ${verification.studiesWithProgramID}/${verification.totalStudies} studies have valid programIDs`);
            console.log(`   🧹 All programs cleaned up (studies arrays removed)`);
        }
        
        return {
            success: isComplete,
            verification: verification
        };
        
    } catch (error) {
        console.error("❌ Verification failed: " + error.message);
        return { success: false, error: error.message };
    }
}

// Export functions for Node.js module usage
module.exports = {
    populateProgramIDInApprovedStudies,
    ensureNAProgramExists,
    updateStudyProgramID,
    verifyProgramIDMigration
};

// Auto-execute if run directly (requires database connection)
if (require.main === module) {
    console.log("❌ This migration file requires a database connection.");
    console.log("💡 Please run it through the orchestrator:");
    console.log("   npm run migrate:3.5.0");
    process.exit(1);
}