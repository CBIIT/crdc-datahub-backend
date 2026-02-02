/**
 * 3.6.0 Migration Script
 * Node.js migration orchestrator that explicitly calls each migration file
 * 
 * Usage: npm run migrate:3.6.0
 *         (or directly: node documentation/3-6-0/3-6-0-migration.js)
 * 
 * Migration files:
 * - rename-application-id.js: Rename pendingApplicationID to applicationID in ApprovedStudies
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
                name: "Rename pendingApplicationID to applicationID",
                file: "rename-application-id.js",
                execute: () => executeApplicationIDMigration(db)
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

