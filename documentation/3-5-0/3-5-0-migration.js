
/**
 * Add PSDC to DATA_COMMONS_LIST configuration
 */
function addPSDCToDataCommonsList() {
    print("🔄 Adding PSDC to DATA_COMMONS_LIST configuration...");
    
    try {
        // Check if DATA_COMMONS_LIST configuration exists
        var existingConfig = db.configuration.findOne({ type: "DATA_COMMONS_LIST" });
        
        if (existingConfig) {
            // Update existing configuration to include PSDC
            var currentList = existingConfig.key || [];
            if (currentList.indexOf("PSDC") === -1) {
                currentList.push("PSDC");
                db.configuration.updateOne(
                    { type: "DATA_COMMONS_LIST" },
                    { $set: { key: currentList } }
                );
                print("✅ Successfully added PSDC to existing DATA_COMMONS_LIST configuration");
                print("📋 Updated list: " + JSON.stringify(currentList));
            } else {
                print("ℹ️  PSDC already exists in DATA_COMMONS_LIST configuration");
            }
        } else {
            // Create new configuration if it doesn't exist
            db.configuration.insertOne({
                type: "DATA_COMMONS_LIST",
                key: ["CDS", "ICDC", "CTDC", "CCDI", "PSDC", "Test MDF", "Hidden Model"]
            });
            print("✅ Successfully created new DATA_COMMONS_LIST configuration with PSDC");
        }
        
        return { success: true, message: "PSDC added to DATA_COMMONS_LIST" };
    } catch (error) {
        print("❌ Error adding PSDC to DATA_COMMONS_LIST: " + error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Verify PSDC configuration is properly set up
 * This function checks that PSDC is in DATA_COMMONS_LIST and S3 bucket mapping exists
 */
function verifyPSDCConfiguration() {
    print("🔍 Verifying PSDC configuration...");
    
    try {
        var results = {
            dataCommonsList: false,
            s3BucketMapping: false
        };
        
        // Check DATA_COMMONS_LIST configuration
        var dataCommonsListConfig = db.configuration.findOne({ type: "DATA_COMMONS_LIST" });
        if (dataCommonsListConfig && dataCommonsListConfig.key && dataCommonsListConfig.key.includes("PSDC")) {
            results.dataCommonsList = true;
            print("✅ PSDC found in DATA_COMMONS_LIST configuration");
        } else {
            print("❌ PSDC NOT found in DATA_COMMONS_LIST configuration");
        }
        
        // Check S3 bucket mapping
        var s3BucketMapping = db.configuration.findOne({ 
            type: "Metadata Bucket", 
            dataCommons: "PSDC" 
        });
        if (s3BucketMapping) {
            results.s3BucketMapping = true;
            print("✅ PSDC S3 bucket mapping found");
            print("📦 Bucket name: " + s3BucketMapping.bucketName);
        } else {
            print("❌ PSDC S3 bucket mapping NOT found");
            print("📝 Please manually add the S3 bucket mapping:");
        }
        
        var allConfigured = Object.values(results).every(v => v === true);
        if (allConfigured) {
            print("🎉 PSDC configuration verification completed successfully!");
        } else {
            print("⚠️  PSDC configuration verification completed with issues");
        }
        
        return { success: allConfigured, results: results };
    } catch (error) {
        print("❌ Error verifying PSDC configuration: " + error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Main migration function that runs all PSDC-related updates
 * This function is idempotent and can be run multiple times safely
 */
function migratePSDCDataCommons() {
    print("🚀 Starting 3.5.0 migration...");
    print("============================================================");
    
    var startTime = new Date();
    var results = [];
    
    try {
        // Add PSDC to DATA_COMMONS_LIST
        results.push(addPSDCToDataCommonsList());
        
        // Verify configuration
        var verification = verifyPSDCConfiguration();
        results.push(verification);
        
        var endTime = new Date();
        var duration = endTime - startTime;
        
        print("============================================================");
        print("📊 Migration Summary:");
        print("⏱️  Duration: " + duration + "ms");
        
        var successCount = results.filter(r => r.success).length;
        var totalCount = results.length;
        
        print("✅ Successful operations: " + successCount + "/" + totalCount);
        
        if (successCount === totalCount) {
            print("🎉 PSDC Data Commons migration completed successfully!");
        } else {
            print("⚠️  PSDC Data Commons migration completed with some issues");
            print("📝 Please check the output above for manual steps required");
        }
        
        return {
            success: successCount === totalCount,
            duration: duration,
            results: results
        };
        
    } catch (error) {
        print("❌ Migration failed with error: " + error.message);
        return { success: false, error: error.message };
    }
}

migratePSDCDataCommons();