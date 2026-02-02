/**
 * PSDC Data Commons Configuration Migration
 * Version: 3.5.0
 * Description: Adds PSDC to DATA_COMMONS_LIST configuration and verifies setup
 * 
 * Usage: 
 *   - As Node.js module: const migration = require('./psdc-data-commons-update');
 *     const result = await migration.migratePSDCDataCommons(db);
 *   - Direct execution: node psdc-data-commons-update.js
 */

/**
 * Add PSDC to DATA_COMMONS_LIST configuration
 */
async function addPSDCToDataCommonsList(db) {
    try {
        // Check my configuration exists
        const existingConfig = await db.collection('configuration').findOne({ type: "DATA_COMMONS_LIST" });
        
        if (existingConfig) {
            // Update existing configuration to include PSDC
            const currentList = existingConfig.key || [];
            if (currentList.indexOf("PSDC") === -1) {
                currentList.push("PSDC");
                await db.collection('configuration').updateOne(
                    { type: "DATA_COMMONS_LIST" },
                    { $set: { key: currentList } }
                );
            }
        } else {
            // Create new configuration if it doesn't exist
            await db.collection('configuration').insertOne({
                type: "DATA_COMMONS_LIST",
                key: ["CDS", "ICDC", "CTDC", "CCDI", "PSDC", "Test MDF", "Hidden Model"]
            });
        }
        
        return { success: true, message: "PSDC added to DATA_COMMONS_LIST" };
    } catch (error) {
        console.error("❌ Error adding PSDC to DATA_COMMONS_LIST: " + error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Verify PSDC configuration is properly set up
 */
async function verifyPSDCConfiguration(db) {
    try {
        const results = {
            dataCommonsList: false,
            s3BucketMapping: false
        };
        
        // Check DATA_COMMONS_LIST configuration
        const dataCommonsListConfig = await db.collection('configuration').findOne({ type: "DATA_COMMONS_LIST" });
        if (dataCommonsListConfig && dataCommonsListConfig.key && dataCommonsListConfig.key.includes("PSDC")) {
            results.dataCommonsList = true;
        }
        
        // Check S3 bucket mapping
        const s3BucketMapping = await db.collection('configuration').findOne({ 
            type: "Metadata Bucket", 
            dataCommons: "PSDC" 
        });
        if (s3BucketMapping) {
            results.s3BucketMapping = true;
        } else if (!results.dataCommonsList) {
            console.warn("⚠️  PSDC S3 bucket mapping NOT found - manual configuration may be needed");
        }
        
        const allConfigured = Object.values(results).every(v => v === true);
        return { success: allConfigured, results: results };
    } catch (error) {
        console.error("❌ Error verifying PSDC configuration: " + error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Helper function to execute PSDC migrations
 */
async function migratePSDCDataCommons(db) {
    console.log("🔄 Starting PSDC Data Commons migration...");
    
    const startTime = new Date();
    const results = [];
    
    try {
        // Add PSDC to DATA_COMMONS_LIST
        results.push(await addPSDCToDataCommonsList(db));
        
        // Verify configuration
        const verification = await verifyPSDCConfiguration(db);
        results.push(verification);
        
        const endTime = new Date();
        const duration = endTime - startTime;
        
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;
        
        console.log(`✅ PSDC migration completed: ${successCount}/${totalCount} operations successful (${duration}ms)`);
        
        return {
            success: successCount === totalCount,
            duration: duration,
            results: results,
            message: "PSDC Data Commons configuration completed"
        };
        
    } catch (error) {
        console.error("❌ PSDC migration failed: " + error.message);
        return {
            success: false,
            error: error.message,
            message: "PSDC Data Commons configuration failed"
        };
    }
}

// Export functions for Node.js module usage
module.exports = {
    addPSDCToDataCommonsList,
    verifyPSDCConfiguration,
    migratePSDCDataCommons
};

// Auto-execute if run directly (requires database connection)
if (require.main === module) {
    console.log("❌ This migration file requires a database connection.");
    console.log("💡 Please run it through the orchestrator:");
    console.log("   npm run migrate:3.5.0");
    process.exit(1);
}