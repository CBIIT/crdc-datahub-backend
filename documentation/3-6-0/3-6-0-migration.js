/**
 * 3.6.0 Migration Script
 * Node.js migration orchestrator that explicitly calls each migration file
 *
 * Usage: npm run migrate:3.6.0
 *         (or directly: node documentation/3-6-0/3-6-0-migration.js)
 * 
 * Migration files:
 * - create-property-pvs-collection.js: Create propertyPVs MongoDB collection if missing
 * - rename-application-id.js: Rename pendingApplicationID to applicationID in ApprovedStudies
 * - init-metadata-validation-batch-size.js: Initialize METADATA_VALIDATION_BATCH_SIZE config entry
 * - add-sts-resource-config.js: Add STS_RESOURCE configuration (tier-based URL)
 * - add-chatbot-enabled-config.js: Add CHATBOT configuration (keys.enabled feature flag)
 * - backfill-approved-study-status.js: Set status Active on approvedStudies where missing
 * - lowercase-synonym-terms.js: Lowercase string synonym_term in synonyms (skips missing/non-string)
 * - backfill-submission-type-regular.js: Set submissionType Regular on legacy submissions where missing
 */

const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config();

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

/**
 * Create MongoDB connection using environment variables
 */
async function createDatabaseConnection() {
    try {
        const user = process.env.MONGO_DB_USER;
        const password = process.env.MONGO_DB_PASSWORD;
        const host = process.env.MONGO_DB_HOST || 'localhost';
        const port = process.env.MONGO_DB_PORT || '27017';
        
        // Construct connection string
        let connectionString;
        if (user && password) {
            connectionString = `mongodb://${user}:${password}@${host}:${port}`;
        } else {
            connectionString = `mongodb://${host}:${port}`;
        }
        
        const client = new MongoClient(connectionString);
        await client.connect();
        
        // Get database name from environment or use default
        const dbName = process.env.MONGO_DB_NAME || process.env.DATABASE_NAME || 'crdc-datahub';
        const db = client.db(dbName);
        
        console.log(`📊 Connected to database: ${dbName}`);
        
        return {
            client,
            db,
            dbName,
            connectionString: `mongodb://${user ? user + ':***@' : ''}${host}:${port}/${dbName}`
        };
        
    } catch (error) {
        console.error('❌ Failed to connect to database:', error.message);
        throw error;
    }
}

/**
 * Close database connection
 */
async function closeDatabaseConnection(client) {
    try {
        await client.close();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error.message);
    }
}


// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Execute propertyPVs collection creation
 */
async function executePropertyPVsCollectionMigration(db) {
    console.log('🔄 Executing propertyPVs collection creation...');

    try {
        const migration = require('./create-property-pvs-collection');
        const result = await migration.createPropertyPVsCollection(db);

        if (result.success) {
            console.log('✅ propertyPVs collection migration completed successfully');
        } else {
            console.log('❌ propertyPVs collection migration failed');
        }

        return result;
    } catch (error) {
        console.error('❌ Error executing propertyPVs collection migration:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute METADATA_VALIDATION_BATCH_SIZE config initialization
 */
async function executeMetadataValidationBatchSizeMigration(db) {
    console.log('🔄 Executing METADATA_VALIDATION_BATCH_SIZE initialization...');

    try {
        const migration = require('./init-metadata-validation-batch-size');
        const result = await migration.initMetadataValidationBatchSize(db);

        if (result.success) {
            console.log('✅ METADATA_VALIDATION_BATCH_SIZE initialization completed successfully');
        } else {
            console.log('❌ METADATA_VALIDATION_BATCH_SIZE initialization failed');
        }

        return result;
    } catch (error) {
        console.error('❌ Error executing METADATA_VALIDATION_BATCH_SIZE initialization:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute applicationID migration
 */
async function executeApplicationIDMigration(db) {
    console.log('🔄 Executing applicationID migration...');
    
    try {
        const applicationIDMigration = require('./rename-application-id');
        
        // Call the migration function with database connection
        const result = await applicationIDMigration.migrateApplicationID(db);

        if (result.success) {
            console.log('✅ applicationID migration completed successfully');
        } else {
            console.log('❌ applicationID migration failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error executing applicationID migration:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute STS_RESOURCE configuration migration
 */
async function executeStsResourceConfigMigration(db) {
    console.log('🔄 Executing STS_RESOURCE configuration migration...');
    
    try {
        const stsResourceConfigMigration = require('./add-sts-resource-config');
        
        const result = await stsResourceConfigMigration.addStsResourceConfig(db);

        if (result.success) {
            console.log('✅ STS_RESOURCE configuration migration completed successfully');
        } else {
            console.log('❌ STS_RESOURCE configuration migration failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error executing STS_RESOURCE configuration migration:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute adding INACTIVE_NEW_APPLICATION_DAYS configuration
 */
async function executeShortInactiveApplicationConfigMigration(db) {
    console.log('🔄 Executing INACTIVE_NEW_APPLICATION_DAYS configuration migration...');
    try {
        const migration = require('./add-short-inactive-application-config');
        const result = await migration.addShortInactiveApplicationConfig(db);
        if (result.success) {
            console.log('✅ INACTIVE_NEW_APPLICATION_DAYS migration completed successfully');
        } else {
            console.log('❌ INACTIVE_NEW_APPLICATION_DAYS migration failed');
        }
        return result;
    } catch (error) {
        console.error('❌ Error executing INACTIVE_NEW_APPLICATION_DAYS configuration migration:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute ApprovedStudy.status backfill (Active where missing)
 */
async function executeApprovedStudyStatusBackfill(db) {
    console.log("🔄 Executing ApprovedStudy.status backfill...");

    try {
        const migration = require("./backfill-approved-study-status");
        const result = await migration.backfillApprovedStudyStatus(db);

        if (result.success) {
            console.log("✅ ApprovedStudy.status backfill completed successfully");
        } else {
            console.log("❌ ApprovedStudy.status backfill failed");
        }

        return result;
    } catch (error) {
        console.error("❌ Error executing ApprovedStudy.status backfill:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute synonym_term lowercase migration
 */
async function executeLowercaseSynonymTermsMigration(db) {
    console.log("🔄 Executing synonym_term lowercase migration...");

    try {
        const migration = require("./lowercase-synonym-terms");
        const result = await migration.lowercaseSynonymTerms(db);

        if (result.success) {
            console.log("✅ synonym_term lowercase migration completed successfully");
        } else {
            console.log("❌ synonym_term lowercase migration failed");
        }

        return result;
    } catch (error) {
        console.error("❌ Error executing synonym_term lowercase migration:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute Submission.submissionType backfill (Regular where missing or null)
 */
async function executeSubmissionTypeRegularBackfill(db) {
    console.log("🔄 Executing Submission.submissionType backfill...");

    try {
        const migration = require("./backfill-submission-type-regular");
        const result = await migration.backfillSubmissionTypeRegular(db);

        if (result.success) {
            console.log("✅ Submission.submissionType backfill completed successfully");
        } else {
            console.log("❌ Submission.submissionType backfill failed");
        }

        return result;
    } catch (error) {
        console.error("❌ Error executing Submission.submissionType backfill:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Execute CHATBOT configuration migration
 */
async function executeChatbotEnabledConfigMigration(db) {
    console.log('🔄 Executing CHATBOT configuration migration...');

    try {
        const chatbotEnabledConfigMigration = require('./add-chatbot-enabled-config');
        const result = await chatbotEnabledConfigMigration.addChatbotEnabledConfig(db);

        if (result.success) {
            console.log('✅ CHATBOT configuration migration completed successfully');
        } else {
            console.log('❌ CHATBOT configuration migration failed');
        }

        return result;
    } catch (error) {
        console.error('❌ Error executing CHATBOT configuration migration:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// MIGRATION ORCHESTRATOR
// ============================================================================

/**
 * Main orchestrator function
 */
async function orchestrateMigration() {
    console.log('🚀 Starting 3.6.0 migrations execution...');
    console.log('============================================================');
    
    const startTime = new Date();
    let client;
    
    try {
        // Create database connection
        const dbConnection = await createDatabaseConnection();
        client = dbConnection.client;
        const db = dbConnection.db;
        
        // Define available migrations explicitly
        // Add migrations here as they are created:
        // {
        //     name: "Migration Name",
        //     file: "migration-file.js",
        //     execute: () => executeMigrationFunction(db)
        // }
        const availableMigrations = [
            {
                name: "Create propertyPVs collection",
                file: "create-property-pvs-collection.js",
                execute: () => executePropertyPVsCollectionMigration(db)
            },
            {
                name: "Rename pendingApplicationID to applicationID",
                file: "rename-application-id.js",
                execute: () => executeApplicationIDMigration(db)
            },
            {
                name: "Initialize METADATA_VALIDATION_BATCH_SIZE configuration",
                file: "init-metadata-validation-batch-size.js",
                execute: () => executeMetadataValidationBatchSizeMigration(db)
            },
            {
                name: "Add STS_RESOURCE configuration (tier-based URL)",
                file: "add-sts-resource-config.js",
                execute: () => executeStsResourceConfigMigration(db)
            },
            {
                name: "Add CHATBOT configuration",
                file: "add-chatbot-enabled-config.js",
                execute: () => executeChatbotEnabledConfigMigration(db)
            },
            {
                name: "Add INACTIVE_NEW_APPLICATION_DAYS configuration",
                file: "add-short-inactive-application-config.js",
                execute: () => executeShortInactiveApplicationConfigMigration(db)
            },
            {
                name: "Backfill ApprovedStudy.status (Active where missing)",
                file: "backfill-approved-study-status.js",
                execute: () => executeApprovedStudyStatusBackfill(db)
            },
            {
                name: "Lowercase synonym_term in synonyms collection",
                file: "lowercase-synonym-terms.js",
                execute: () => executeLowercaseSynonymTermsMigration(db)
            },
            {
                name: "Backfill Submission.submissionType (Regular where missing)",
                file: "backfill-submission-type-regular.js",
                execute: () => executeSubmissionTypeRegularBackfill(db)
            }
        ];
        
        // Check if there are any migrations to run
        if (availableMigrations.length === 0) {
            console.log('ℹ️  No migrations defined yet for 3.6.0');
            console.log('💡 Add migrations to the availableMigrations array in this file');
            return {
                success: true,
                duration: new Date() - startTime,
                migrationsExecuted: 0,
                migrationsSuccessful: 0,
                results: []
            };
        }
        
        // Execute migrations (each migration handles its own status checking)
        const migrations = [];
        
        for (const migration of availableMigrations) {
            
            try {
                const result = await migration.execute();
                migrations.push({
                    name: migration.name,
                    file: migration.file,
                    success: result.success !== false,
                    result: result
                });
                
            } catch (error) {
                console.error(`❌ ${migration.name} failed: ${error.message}`);
                migrations.push({
                    name: migration.name,
                    file: migration.file,
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Summary
        const endTime = new Date();
        const duration = endTime - startTime;
        
        const successCount = migrations.filter(m => m.success).length;
        const totalCount = migrations.length;
        
        console.log(`✅ Migration process completed: ${successCount}/${totalCount} successful (${duration}ms)`);
        
        if (successCount !== totalCount) {
            console.warn("⚠️  Some migrations encountered issues - see errors above");
        }
        
        return {
            success: successCount === totalCount,
            duration: duration,
            migrationsExecuted: totalCount,
            migrationsSuccessful: successCount,
            results: migrations
        };
        
    } catch (error) {
        console.error('❌ Migration orchestration failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        if (client) {
            await closeDatabaseConnection(client);
        }
    }
}

// ============================================================================
// EXECUTION
// ============================================================================

// Run the orchestrator
async function main() {
    try {
        const result = await orchestrateMigration();
        
        if (result.success) {
            console.log('\n✅ Migration orchestration completed successfully!');
            process.exit(0);
        } else {
            console.log('\n❌ Migration orchestration failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error.message);
    process.exit(1);
});

// Handle SIGINT for graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Execute if this file is run directly
if (require.main === module) {
    main();
}

module.exports = {
    orchestrateMigration,
    createDatabaseConnection,
    closeDatabaseConnection
};

