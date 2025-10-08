# 3.5.0 Migration Suite

This directory contains migration scripts for version 3.5.0 of the CRDC Data Hub Backend.

## Structure

- **`3-5-0-migration.js`** - Main orchestrator that executes all migrations
- **`psdc-data-commons-update.js`** - PSDC Data Commons configuration migration
- **`populate-program-id.js`** - Program ID population migration
- **`README.md`** - This documentation file

## Running Migrations

### Prerequisites
- Node.js (version 12 or higher)
- MongoDB database access
- Environment variables configured (see `.env` file)

### Run All Migrations
```bash
# Using npm script (recommended)
npm run migrate:3.5.0

# Or run directly
node documentation/3-5-0/3-5-0-migration.js
```

### Run Individual Migrations
Individual migrations cannot be run directly as they require database connection parameters. Use the orchestrator instead.

### Environment Variables Required
Make sure these variables are set in your `.env` file:
```bash
MONGO_DB_USER=your_mongo_user
MONGO_DB_PASSWORD=your_mongo_password  
MONGO_DB_HOST=localhost
MONGO_DB_PORT=27017
MONGO_DB_NAME=crdc_datahub  # or your database name
```

### Examples
```bash
# With local MongoDB
MONGO_DB_HOST=localhost MONGO_DB_PORT=27017 node documentation/3-5-0/3-5-0-migration.js

# With remote MongoDB
MONGO_DB_HOST=mongodb-cluster.com MONGO_DB_PORT=27017 node documentation/3-5-0/3-5-0-migration.js
```

## Migration Details

### 1. PSDC Data Commons Setup
- Adds PSDC to DATA_COMMONS_LIST configuration
- Verifies configuration completeness

### 2. Program ID Population
- Populates `programID` field in approved studies
- Creates "NA" program for studies without valid program assignments
- Maps studies to existing programs based on `programName` field
- Provides comprehensive reporting and verification

## Migration File Organization

Each migration is stored in its own file for clarity and maintainability:

- **Individual Files**: Each migration has its own `.js` file with specific functionality
- **Main Orchestrator**: `3-5-0-migration.js` is a minimal orchestrator that provides guidance and migration status
- **Standalone Execution**: Each migration file can be run independently

## Orchestrator Approach

The `3-5-0-migration.js` file serves as a Node.js-based orchestrator that:

- **Database Connection**: Establishes MongoDB connection using environment variables
- **Status Checking**: Verifies which migrations have already been completed
- **Execution Control**: Runs migrations conditionally based on current database state
- **Comprehensive Reporting**: Provides detailed output of migration execution and results

## Safety Features

- **Idempotent**: All migrations can be run multiple times safely
- **Rollback Safe**: Does not modify existing data, only adds missing fields
- **Comprehensive Logging**: Detailed progress statements and error reporting
- **Verification**: Built-in verification steps to ensure migration success

## Adding New Migrations

To add a new migration to the 3.5.0 suite:

1. Create a new `.js` file in this directory with the migration logic
2. Export the main migration function from the file
3. Add the migration to the `availableMigrations` array in `3-5-0-migration.js`
4. Implement status checking logic if the migration should be conditional
5. Ensure your migration is idempotent and well-logged

### Example Migration Structure

```javascript
/**
 * Your Migration Name
 */
async function yourMigrationFunction(db) {
    console.log("🔄 Starting your migration...");
    
    try {
        // Migration logic here using the provided db connection
        // Use db.collection('yourCollection').findOne() etc.
        
        return {
            success: true,
            message: "Migration completed successfully"
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: "Migration failed"
        };
    }
}

module.exports = {
    yourMigrationFunction
};
```

### Adding to Orchestrator

Add an entry to the `availableMigrations` array:

```javascript
{
    name: "Your Migration Name",
    file: "your-migration-file.js",
    shouldRun: !statusCheck.yourMigrationCondition, // Add condition to checkMigrationStatus
    execute: () => executeYourMigration(db)
}
```
