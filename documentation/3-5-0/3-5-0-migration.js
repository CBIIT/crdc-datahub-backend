/**
 * 3.5.0 Migration Script
 * Node.js migration orchestrator that explicitly calls each migration file
 * 
 * Usage: npm run migrate:3.5.0
 *         (or directly: node documentation/3-5-0/3-5-0-migration.js)
 * 
 * Migration files:
 * - psdc-data-commons-update.js: Complete PSDC Data Commons configuration  
 * - populate-program-id.js: Complete Program ID population migration
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
// MIGRATION ORCHESTRATOR
// ============================================================================

/**
 * Execute PSDC migration
 */
async function executePSDCMigration(db) {
    console.log('🔄 Executing PSDC Data Commons migration...');
    
    try {
        const fpdcMigration = require('./psdc-data-commons-update');
        
        // Call the migration function with database connection
        const result = await fpdcMigration.migratePSDCDataCommons(db);

        if (result.success) {
            console.log('✅ PSDC migration completed successfully');
        } else {
            console.log('❌ PSDC migration failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error executing PSDC migration:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Execute Program ID migration
 */
async function executeProgramIDMigration(db) {
    console.log('🔄 Executing Program ID population migration...');
    
    try {
        const programIDMigration = require('./populate-program-id');
        
        // Call the migration function with database connection
        const result = await programIDMigration.populateProgramIDInApprovedStudies(db);

        if (result.success) {
            console.log('✅ Program ID migration completed successfully');
        } else {
            console.log('❌ Program ID migration failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error executing Program ID migration:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Main orchestrator function
 */
async function orchestrateMigration() {
    console.log('🚀 Starting 3.5.0 migrations execution...');
    console.log('============================================================');
    
    const startTime = new Date();
    let client;
    
    try {
        // Create database connection
        const dbConnection = await createDatabaseConnection();
        client = dbConnection.client;
        const db = dbConnection.db;
        
        // Define available migrations explicitly  
        const availableMigrations = [
            {
                name: "PSDC Data Commons Setup",
                file: "psdc-data-commons-update.js",
                execute: () => executePSDCMigration(db)
            },
            {
                name: "Populate Program ID",
                file: "populate-program-id.js", 
                execute: () => executeProgramIDMigration(db)
            }
        ];
        
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