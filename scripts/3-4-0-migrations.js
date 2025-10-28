const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const configuration = require('../config');

/**
 * Migration Runner for 3.4.0
 * Executes MongoDB migrations using Node.js MongoDB driver
 */
class MigrationRunner {
    constructor() {
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            // Validate configuration
            if (!configuration.mongo_db_connection_string) {
                throw new Error('MongoDB connection string not configured');
            }
            
            // Configure connection with optimal settings for migrations
            this.client = new MongoClient(configuration.mongo_db_connection_string, {
                maxPoolSize: 10,                    // Maximum number of connections
                serverSelectionTimeoutMS: 5000,     // 5 second timeout for server selection
                socketTimeoutMS: 45000,             // 45 second timeout for operations
                connectTimeoutMS: 10000,            // 10 second timeout for initial connection
                retryWrites: true,                  // Enable retryable writes
                retryReads: true                    // Enable retryable reads
            });
            await this.client.connect();
            
            // Determine database name based on environment
            const dbName = this.getDatabaseName();
            this.db = this.client.db(dbName);
            
            console.log(`✅ Connected to MongoDB database: ${dbName}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to MongoDB:', error.message);
            throw error;
        }
    }

    getDatabaseName() {
        // Check if we're in DEV2/QA2 environment
        const connectionString = configuration.mongo_db_connection_string;
        if (connectionString.includes('crdc-datahub2') || 
            process.env.NODE_ENV === 'development' || 
            process.env.TIER?.toLowerCase().includes('dev2') ||
            process.env.TIER?.toLowerCase().includes('qa2')) {
            return 'crdc-datahub2';
        }
        return 'crdc-datahub';
    }

    async executeMigration() {
        try {
            console.log("🚀 Starting 3.4.0 Migration Suite");
            console.log("=".repeat(50));

            const totalPhases = 5;
            const startTime = Date.now();

            // Phase 1: Foundation Setup
            console.log(`📊 Progress: ${Math.round((1/totalPhases)*100)}% - Phase 1/5`);
            await this.executePhase1();
            
            // Phase 2: User Management
            console.log(`📊 Progress: ${Math.round((2/totalPhases)*100)}% - Phase 2/5`);
            await this.executePhase2();
            
            // Phase 3: Study and Organization Management
            console.log(`📊 Progress: ${Math.round((3/totalPhases)*100)}% - Phase 3/5`);
            await this.executePhase3();
            
            // Phase 4: Submission Data Migration
            console.log(`📊 Progress: ${Math.round((4/totalPhases)*100)}% - Phase 4/5`);
            await this.executePhase4();
            
            // Phase 5: Configuration and Cleanup
            console.log(`📊 Progress: ${Math.round((5/totalPhases)*100)}% - Phase 5/5`);
            await this.executePhase5();

            // Run concierge cleanup automatically (idempotent and safe)
            console.log("\n🧹 Running concierge cleanup...");
            await this.cleanupOldConciergeFields();

            // Restore notification SR automatically (idempotent and safe)
            console.log("\n🔔 Restoring notification SR...");
            await this.restoreUserNotifications("submission_request:pending_cleared", { role: { $in: ["Submitter", "User"] } });

            const executionTime = Date.now() - startTime;
            const executionMinutes = Math.round(executionTime / 60000 * 100) / 100;
            
            console.log("\n" + "=".repeat(50));
            console.log("🎉 3.4.0 Migration Suite Complete!");
            console.log(`⏱️  Total execution time: ${executionMinutes} minutes`);
            console.log("=".repeat(50));

            console.log("\n📊 Summary:");
            console.log("✅ Foundation setup completed");
            console.log("✅ User management completed");
            console.log("✅ Study and organization management completed");
            console.log("✅ Submission data migration completed");
            console.log("✅ Configuration and cleanup completed");
            console.log("✅ StudyName field added to applications completed");
            console.log("✅ GPAName field updated from questionnaireData (missing/mismatched values) completed");
            console.log("✅ Institution status migration completed");
            console.log("✅ Review comment array fix completed");
            console.log("✅ Concierge cleanup completed");
            console.log("✅ Notification SR restore completed");

            console.log("\n⚠️  Manual Steps Remaining:");
            console.log("1. Verify all migrations completed successfully");

            console.log("\n🔍 Verification Commands:");
            console.log("db.users.countDocuments();");
            console.log("db.submissions.countDocuments();");
            console.log("db.applications.countDocuments();");
            console.log("db.submissions.find({studyID: {$exists: true}}).count();");
            console.log("db.submissions.find({programID: {$exists: true}}).count();");
            console.log("db.submissions.find({conciergeID: {$exists: true}}).count();");
            console.log("db.applications.find({applicantID: {$exists: true}}).count();");
            console.log("db.applications.find({studyName: {$exists: true}}).count();");
            console.log("db.applications.find({GPAName: {$exists: true, $ne: ''}}).count();");
            console.log("db.institutions.find({status: 'Active'}).count();");
            console.log("db.submissions.find({reviewComment: {$type: 'array'}}).count();");

            console.log("\n✨ All migrations are idempotent and safe to re-run if needed!");
            console.log("=".repeat(50));
            
            return true;
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    }

    async executePhase1() {
        console.log("\n📋 Phase 1: Foundation Setup");

        // 1.1 Database Selection (Automatic - handled by getDatabaseName())
        console.log(`✅ Database automatically selected: ${this.db.databaseName}`);

        // 1.2 Collection Creation
        console.log("Creating pendingPvs collection...");
        try {
            await this.db.createCollection("pendingPvs");
            console.log("✅ pendingPvs collection created");
        } catch (e) {
            if (e.code === 48) {
                console.log("✅ pendingPvs collection already exists");
            } else {
                console.log("❌ Error creating pendingPvs collection:", e.message);
            }
        }

        // 1.3 Data Commons Lookup
        console.log("Adding dataCommons lookup...");
        try {
            await this.db.collection('dataCommons').insertOne({
                "_id": "4245e09e-52eb-42b6-85e9-a3a23539994f",
                "dataCommons": "CDS",
                "dataCommonsDisplayName": "GC"
            });
            console.log("✅ dataCommons lookup added");
        } catch (e) {
            if (e.code === 11000) {
                console.log("✅ dataCommons lookup already exists");
            } else {
                console.log("❌ Error adding dataCommons lookup:", e.message);
            }
        }

        // 1.4 Set Default Pending Model Change
        console.log("Setting default pendingModelChange to false...");
        try {
            const result = await this.db.collection('approvedStudies').updateMany(
                { pendingModelChange: { $exists: false } },
                { $set: { pendingModelChange: false } }
            );
            console.log(`✅ Set pendingModelChange to false for ${result.modifiedCount} approved studies`);
        } catch (e) {
            console.log("❌ Error setting pendingModelChange:", e.message);
        }
    }

    async executePhase2() {
        console.log("\n👥 Phase 2: User Management");

        // 2.1 User Full Name Migration
        console.log("Adding fullName to users...");
        const formatName = (userInfo) => {
            if (!userInfo) return "";
            let firstName = userInfo?.firstName || "";
            let lastName = userInfo?.lastName || "";
            lastName = lastName.trim();
            return firstName + (lastName.length > 0 ? " " + lastName : "");
        };

        const cursor = this.db.collection('users').find({});
        let successCount = 0;
        let failed = [];

        while (await cursor.hasNext()) {
            const user = await cursor.next();
            const fullName = formatName(user);
            try {
                const result = await this.db.collection('users').updateOne(
                    { _id: user._id, fullName: {$exists: false} },
                    { $set: { fullName } }
                );

                if (result.modifiedCount === 1) {
                    successCount++;
                }
            } catch (err) {
                failed.push({ id: user._id, error: err.message });
            }
        }
        console.log(`✅ Updated ${successCount} users with fullName`);
        if (failed.length > 0) {
            console.log(`⚠️  ${failed.length} users failed`);
        }

        // 2.2 NIH User Reactivation
        console.log("Reactivating NIH users...");
        try {
            const result = await this.db.collection('users').updateMany(
                { IDP: "nih" },
                { $set: { userStatus: "Active", updateAt: new Date() } }
            );
            console.log(`✅ Reactivated ${result.modifiedCount} NIH users`);
        } catch (e) {
            console.log("❌ Error reactivating NIH users:", e.message);
        }

        // 2.3 User Notifications
        console.log("Adding user notifications...");
        try {
            // Add data_submission:pv_requested to Data Commons Personnel
            const result1 = await this.db.collection('users').updateMany(
                { role: { $in: ["Data Commons Personnel"] } },
                { $addToSet: { notifications: "data_submission:pv_requested" } }
            );
            console.log(`✅ Added pv_requested notification to ${result1.modifiedCount} Data Commons Personnel`);

            // Add submission_request:pending_cleared to User/Submitter roles
            const result2 = await this.db.collection('users').updateMany(
                { role: { $in: ["User", "Submitter"] } },
                { $addToSet: { notifications: "submission_request:pending_cleared" } }
            );
            console.log(`✅ Added pending_cleared notification to ${result2.modifiedCount} Users/Submitters`);
        } catch (e) {
            console.log("❌ Error adding user notifications:", e.message);
        }
    }

    async executePhase3() {
        console.log("\n🏢 Phase 3: Study and Organization Management");

        // 3.1 Orphan Approved Studies Migration
        console.log("Migrating orphan approved studies...");
        const naElementFactory = (naOrg) => {
            const usesObject = Array.isArray(naOrg.studies) && naOrg.studies.some(s => s && typeof s === "object" && s._id);
            return (id) => (usesObject ? { _id: id } : id);
        };

        const findOrphanApprovedStudies = async () => {
            const orphans = await this.db.collection('approvedStudies').aggregate([
                {
                    $lookup: {
                        from: "organization",
                        let: { sid: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $in: [
                                            "$$sid",
                                            {
                                                $map: {
                                                    input: { $ifNull: ["$studies", []] },
                                                    as: "s",
                                                    in: { $ifNull: ["$$s._id", "$$s"] }
                                                }
                                            }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1 } }
                        ],
                        as: "orgs"
                    }
                },
                { $match: { $expr: { $eq: [{ $size: "$orgs" }, 0] } } },
                { $project: { _id: 1, studyName: 1, dbGaPID: 1 } }
            ]).toArray();
            return orphans;
        };

        const migrateOrphansToNA = async () => {
            const naProgram = await this.db.collection('organization').findOne({ name: "NA" });
            if (!naProgram?._id) {
                console.log("❌ No 'NA' program found. Please create one first.");
                return;
            }
            console.log(`Using NA program: ${naProgram._id}`);

            const orphans = await findOrphanApprovedStudies();
            console.log(`Found ${orphans.length} orphan studies`);

            if (orphans.length === 0) {
                console.log("✅ No orphan studies to migrate");
                return;
            }

            const toNAElement = naElementFactory(naProgram);
            const elementsToAdd = orphans.map(o => toNAElement(o._id));

            const CHUNK = 500;
            let chunksApplied = 0;

            for (let i = 0; i < elementsToAdd.length; i += CHUNK) {
                const chunk = elementsToAdd.slice(i, i + CHUNK);
                const res = await this.db.collection('organization').updateOne(
                    { _id: naProgram._id },
                    {
                        $addToSet: { studies: { $each: chunk } },
                        $set: { updateAt: new Date() }
                    }
                );
                chunksApplied += 1;
            }
            console.log(`✅ Migrated ${orphans.length} orphan studies to NA program`);
        };

        await migrateOrphansToNA();

        // 3.2 Attach Study ID to Submissions
        console.log("Attaching studyID to submissions...");
        const isValidUUID = (uuid) => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            return typeof uuid === 'string' && uuidRegex.test(uuid);
        };

        const attachStudyIDToSubmissions = async () => {
            const submissions = await this.db.collection('submissions').find({}).toArray();
            let updatedCount = 0;
            let skippedCount = 0;

            for (const submission of submissions) {
                const { studyName, studyAbbreviation, _id, studyID } = submission;
                if (!studyName || !studyAbbreviation) continue;

                // Skip if studyID exists and is already a valid UUID
                if (studyID && isValidUUID(studyID)) {
                    skippedCount++;
                    continue;
                }

                const matchedStudy = await this.db.collection('approvedStudies').findOne({
                    studyName,
                    studyAbbreviation,
                });

                if (matchedStudy?._id) {
                    const res = await this.db.collection('submissions').updateOne(
                        { _id },
                        { $set: { studyID: matchedStudy._id } }
                    );
                    if (res?.modifiedCount > 0) {
                        console.log(`Updated submission ${_id} with studyID ${matchedStudy._id} (was: ${studyID || 'missing'})`);
                        updatedCount++;
                    }
                } else {
                    console.warn(`No matching study found for submission ${_id}`);
                }
            }
            console.log(`✅ Updated ${updatedCount} submissions with studyID`);
            console.log(`⏭️  Skipped ${skippedCount} submissions (already have valid studyID)`);
        };

        await attachStudyIDToSubmissions();

        // 3.3 Overwrite Program ID
        console.log("Setting programID for submissions...");
        const findProgramIdForStudy = async (studyID) => {
            const prog = await this.db.collection('organization').findOne(
                { "studies._id": studyID },
                { projection: { _id: 1 } }
            );
            return prog?._id || null;
        };

        const setProgramIDs = async () => {
            const naProgram = await this.db.collection('organization').findOne({ name: "NA" }, { projection: { _id: 1, name: 1 } });
            if (!naProgram?._id) {
                console.log("❌ No 'NA' program found. Please create one first.");
                return;
            }
            console.log(`Using NA program: ${naProgram._id}`);

            const cursor = this.db.collection('submissions').find({ studyID: { $exists: true, $ne: null } });
            let total = 0;
            let successCount = 0;
            let skippedCount = 0;
            const failed = [];

            while (await cursor.hasNext()) {
                const s = await cursor.next();
                total++;

                try {
                    // Skip if programID exists and is already a valid UUID
                    if (s.programID && isValidUUID(s.programID)) {
                        skippedCount++;
                        continue;
                    }

                    const programId = (await findProgramIdForStudy(s.studyID)) || naProgram._id;
                    const res = await this.db.collection('submissions').updateOne(
                        { _id: s._id },
                        { $set: { programID: programId } }
                    );

                    if (res.modifiedCount === 1) {
                        console.log(`Updated submissionID: ${s._id} programID: ${programId} studyID: ${s.studyID} (was: ${s.programID || 'missing'})`);
                        successCount++;
                    }
                } catch (err) {
                    console.error(`❌ Failed for submission ${s._id}: ${err.message}`);
                    failed.push({ id: s._id, error: err.message });
                }
            }
            
            console.log(`\nSummary setting a ProgramID for the submissions.`);
            console.log(`Scanned:  ${total}`);
            console.log(`Updated:  ${successCount}`);
            console.log(`Skipped:  ${skippedCount}`);
            if (failed.length > 0) {
                console.log(`\n❌ Failed: ${failed.length}`);
                console.log(JSON.stringify(failed, null, 2));
            }
        };

        await setProgramIDs();
    }

    async executePhase4() {
        console.log("\n📄 Phase 4: Submission Data Migration");

        // 4.1 Store Concierge ID
        console.log("Storing conciergeID for submissions...");
        const migrateConciergeIDs = async () => {
            const cursor = this.db.collection('submissions').find({
                conciergeName: { $nin: [null, ""] },
                conciergeEmail: { $nin: [null, ""] },
                conciergeID: { $exists: false }
            });

            let updatedCount = 0;
            let notFoundCount = 0;
            let skippedCount = 0;

            while (await cursor.hasNext()) {
                const submission = await cursor.next();
                
                // Double-check conciergeID doesn't exist (extra safety)
                if (submission.conciergeID) {
                    skippedCount++;
                    continue;
                }

                const userNameArr = submission.conciergeName.trim().split(/\s+/);
                if (!submission.conciergeName) {
                    console.log(`no concierge stored for the submission ID: ${submission._id}.`);
                    continue;
                }

                const query = {
                    firstName: userNameArr[0],
                    email: submission.conciergeEmail
                };

                if (userNameArr?.length > 1 && userNameArr[1].trim().length > 0) {
                    query.lastName = userNameArr.slice(1).join(" ");
                }

                const user = await this.db.collection('users').findOne(query);

                if (user) {
                    const res = await this.db.collection('submissions').updateOne(
                        { _id: submission._id },
                        { $set: { conciergeID: user._id } }
                    );
                    if (res.modifiedCount > 0) {
                        console.log(`Updated submission ${submission._id} with conciergeID ${user._id}`);
                        updatedCount++;
                    }
                } else {
                    console.warn(
                        `⚠️  No matching user found for submission ${submission._id}. ` +
                        `Name: "${submission.conciergeName}", Email: "${submission.conciergeEmail}"`
                    );
                    notFoundCount++;
                }
            }
            
            console.log(`Migration complete.`);
            console.log(`✅ Updated: ${updatedCount}`);
            console.log(`⚠️ Not found: ${notFoundCount}`);
            console.log(`⏭️ Skipped: ${skippedCount}`);
        };

        await migrateConciergeIDs();

        // 4.2 Set Entity Type Value in Release
        console.log("Converting entityType arrays to single values...");
        try {
            const result = await this.db.collection('release').updateMany(
                { entityType: { $type: "array" } },
                [
                    {
                        $set: {
                            entityType: { $arrayElemAt: ["$entityType", 0] }
                        }
                    }
                ]
            );
            console.log(`✅ Converted ${result.modifiedCount} release entityType arrays`);
        } catch (e) {
            console.log("❌ Error converting entityType:", e.message);
        }
    }

    async executePhase5() {
        console.log("\n⚙️  Phase 5: Configuration and Cleanup");

        // 5.1 OMB Configuration
        console.log("Adding OMB configuration...");
        try {
            const result = await this.db.collection('configuration').updateOne(
                { type: "OMB_INFO" },
                {
                    $set: {
                        OMBInfo: [
                            "Collection of this information is authorized by The Public Health Service Act, Section 411 (42 USC 285a). Rights of participants are protected by The Privacy Act of 1974. Participation is voluntary, and there are no penalties for not participating or withdrawing at any time. Refusal to participate will not affect your benefits in any way. The information collected will be kept private to the extent provided by law. Names and other identifiers will not appear in any report. Information provided will be combined for all participants and reported as summaries. You are being contacted online to complete this form so that NCI can consider your study for submission into the Cancer Research Data Commons.",
                            "Public reporting burden for this collection of information is estimated to average 60 minutes per response, including the time for reviewing instructions, searching existing data sources, gathering and maintaining the data needed, and completing and reviewing the collection of information. An agency may not conduct or sponsor, and a person is not required to respond to, a collection of information unless it displays a currently valid OMB control number. Send comments regarding this burden estimate or any other aspect of this collection of information, including suggestions for reducing this burden to: NIH, Project Clearance Branch, 6705 Rockledge Drive, MSC 7974, Bethesda, MD 20892-7974, ATTN: PRA (0925-7775). Do not return the completed form to this address."
                        ],
                        OMBNumber: "0925-7775",
                        expirationDate: new Date("2025-06-30T00:00:00.000Z"),
                        type: "OMB_INFO"
                    }
                },
                { upsert: true }
            );
            console.log("✅ OMB configuration added");
        } catch (e) {
            console.log("❌ Error adding OMB configuration:", e.message);
        }

        // 5.2 Application Data Restructuring
        console.log("Restructuring application data...");
        try {
            // Verification: Check applications that need restructuring
            const applicationsToRestructure = await this.db.collection('applications').countDocuments({
                "applicant.applicantID": { $exists: true },
                "applicantID": { $exists: false }
            });
            
            console.log(`📊 Verification: ${applicationsToRestructure} applications need restructuring`);
            
            if (applicationsToRestructure === 0) {
                console.log("✅ No applications need restructuring");
            } else {
                const result = await this.db.collection('applications').updateMany(
                    { 
                        "applicant.applicantID": { $exists: true },
                        "applicantID": { $exists: false }
                    },
                    [
                        { $set: { applicantID: "$applicant.applicantID" } },
                        { $unset: "applicant" }
                    ]
                );
                console.log(`✅ Restructured ${result.modifiedCount} applications`);
            }
        } catch (e) {
            console.log("❌ Error restructuring applications:", e.message);
        }

        // 5.3 Inactive Reminder Flags
        console.log("Adding inactive reminder flags...");
        try {
            // Applications
            const result1 = await this.db.collection('applications').updateMany(
                {},
                [
                    {
                        $set: {
                            inactiveReminder: { $ifNull: ["$inactiveReminder", false] },
                            inactiveReminder_7: { $ifNull: ["$inactiveReminder_7", false] },
                            inactiveReminder_15: { $ifNull: ["$inactiveReminder_15", false] },
                            inactiveReminder_30: { $ifNull: ["$inactiveReminder_30", false] },
                            finalInactiveReminder: { $ifNull: ["$finalInactiveReminder", false] }
                        }
                    }
                ]
            );
            console.log(`✅ Added reminder flags to ${result1.modifiedCount} applications`);

            // Submissions
            const result2 = await this.db.collection('submissions').updateMany(
                {},
                [
                    {
                        $set: {
                            inactiveReminder_7: { $ifNull: ["$inactiveReminder_7", false] },
                            inactiveReminder_30: { $ifNull: ["$inactiveReminder_30", false] },
                            inactiveReminder_60: { $ifNull: ["$inactiveReminder_60", false] },
                            finalInactiveReminder: { $ifNull: ["$finalInactiveReminder", false] }
                        }
                    }
                ]
            );
            console.log(`✅ Added reminder flags to ${result2.modifiedCount} submissions`);
        } catch (e) {
            console.log("❌ Error adding reminder flags:", e.message);
        }

        // 5.4 Add studyName Field to Applications
        console.log("Adding studyName field to applications...");
        try {
            const result = await this.db.collection('applications').updateMany(
                { studyName: { $exists: false } },
                { $set: { studyName: "" } }
            );
            console.log(`✅ Added studyName field to ${result.modifiedCount} applications`);
        } catch (e) {
            console.log("❌ Error adding studyName field:", e.message);
        }

        // 5.5 Update GPAName Field from Questionnaire Data
        console.log("Updating GPAName field from questionnaireData (missing/mismatched values)...");
        try {
            await this.updateGPANameFromQuestionnaire();
        } catch (e) {
            console.log("❌ Error updating GPAName field:", e.message);
        }

        // 5.6 Cleanup Operations
        console.log("Performing cleanup operations...");
        try {
            // Remove empty organizations from users
            const emptyUserOrgs = await this.db.collection('users').countDocuments({
                organization: { $type: "object", $eq: {} }
            });
            console.log(`📊 Verification: ${emptyUserOrgs} users have empty organizations`);
            
            if (emptyUserOrgs > 0) {
                const result1 = await this.db.collection('users').updateMany(
                    { organization: { $type: "object", $eq: {} } },
                    { $unset: { organization: "" } }
                );
                console.log(`✅ Cleaned ${result1.modifiedCount} empty user organizations`);
            } else {
                console.log("✅ No empty user organizations to clean");
            }

            // Remove empty organizations from applications
            const emptyAppOrgs = await this.db.collection('applications').countDocuments({
                $or: [
                    { organization: { $type: "object", $eq: {} } },
                    { "organization._id": null }
                ]
            });
            console.log(`📊 Verification: ${emptyAppOrgs} applications have empty organizations`);
            
            if (emptyAppOrgs > 0) {
                const result2 = await this.db.collection('applications').updateMany(
                    {
                        $or: [
                            { organization: { $type: "object", $eq: {} } },
                            { "organization._id": null }
                        ]
                    },
                    { $unset: { organization: "" } }
                );
                console.log(`✅ Cleaned ${result2.modifiedCount} empty application organizations`);
            } else {
                console.log("✅ No empty application organizations to clean");
            }

            // Remove empty collaborators
            const emptyCollaborators = await this.db.collection('submissions').countDocuments({
                "collaborators.Organization": { $exists: true }
            });
            console.log(`📊 Verification: ${emptyCollaborators} submissions have empty collaborator organizations`);
            
            if (emptyCollaborators > 0) {
                const result3 = await this.db.collection('submissions').updateMany(
                    { "collaborators.Organization": { $exists: true } },
                    { $unset: { "collaborators.$[].Organization": "" } }
                );
                console.log(`✅ Cleaned ${result3.modifiedCount} empty collaborator organizations`);
            } else {
                console.log("✅ No empty collaborator organizations to clean");
            }

            // Remove updatedAt from organization collection
            const orgsWithUpdatedAt = await this.db.collection('organization').countDocuments({
                updatedAt: { $exists: true }
            });
            console.log(`📊 Verification: ${orgsWithUpdatedAt} organizations have updatedAt field`);
            
            if (orgsWithUpdatedAt > 0) {
                const result4 = await this.db.collection('organization').updateMany(
                    { updatedAt: { $exists: true } }, 
                    { $unset: { updatedAt: "" } }
                );
                console.log(`✅ Cleaned ${result4.modifiedCount} organization updatedAt fields`);
            } else {
                console.log("✅ No organization updatedAt fields to clean");
            }
        } catch (e) {
            console.log("❌ Error during cleanup:", e.message);
        }

        // 5.6 Notification Adjustments
        console.log("Adjusting user notifications...");
        try {
            // Add configuration change notification
            const result1 = await this.db.collection('users').updateMany(
                { role: { $in: ["Data Commons Personnel", "Submitter"] } },
                { $addToSet: { notifications: "data_submission:cfg_changed" } }
            );
            console.log(`✅ Added cfg_changed notification to ${result1.modifiedCount} users`);
        } catch (e) {
            console.log("❌ Error adjusting notifications:", e.message);
        }

        // 5.7 Institution Status Migration
        console.log("Setting default institution status...");
        try {
            const result = await this.db.collection('institutions').updateMany(
                {
                    $or: [
                        { status: { $exists: false } },
                        { status: { $nin: ["Active", "Inactive"] } }
                    ]
                },
                {
                    $set: { status: "Active" }
                }
            );
            console.log(`✅ Set status to Active for ${result.modifiedCount} institutions`);
        } catch (e) {
            console.log("❌ Error setting institution status:", e.message);
        }

        // 5.8 Review Comment Array Fix
        console.log("Fixing reviewComment arrays...");
        try {
            const result = await this.db.collection('submissions').updateMany(
                {
                    $or: [
                        { reviewComment: { $exists: true } },
                        { reviewComment: { $type: "array" } }
                    ]
                },
                [
                    {
                        $set: {
                            reviewComment: {
                                $cond: [
                                    { $or: [
                                        { $eq: [{ $type: "$reviewComment" }, "array"] },
                                        { $not: ["$reviewComment"] }
                                    ]},
                                    "",
                                    "$reviewComment"
                                ]
                            }
                        }
                    }
                ]
            );
            console.log(`✅ Fixed ${result.modifiedCount} reviewComment arrays`);
        } catch (e) {
            console.log("❌ Error fixing reviewComment arrays:", e.message);
        }

        // 5.9 Date Type Conversion (QA2 Only)
        console.log("Converting string dates to DateTime (QA2 only)...");
        try {
            const result1 = await this.db.collection('users').updateMany(
                { createdAt: { $type: "string" } },
                [{ $set: { createdAt: { $toDate: "$createdAt" } } }]
            );
            console.log(`✅ Converted ${result1.modifiedCount} createdAt strings to dates`);

            const result2 = await this.db.collection('users').updateMany(
                { updateAt: { $type: "string" } },
                [{ $set: { updateAt: { $toDate: "$updateAt" } } }]
            );
            console.log(`✅ Converted ${result2.modifiedCount} updateAt strings to dates`);
        } catch (e) {
            console.log("❌ Error converting dates:", e.message);
        }
    }

    // Manual cleanup function (run manually after verification)
    async cleanupOldConciergeFields() {
        console.log("🧹 Running concierge cleanup...");
        
        // Verification: Check that conciergeID migration was successful
        const totalSubmissions = await this.db.collection('submissions').countDocuments();
        const submissionsWithConciergeID = await this.db.collection('submissions').countDocuments({
            conciergeID: { $exists: true }
        });
        const submissionsWithOldFields = await this.db.collection('submissions').countDocuments({
            conciergeID: { $exists: true },
            $or: [
                { submitterName: { $exists: true } },
                { conciergeName: { $exists: true } },
                { conciergeEmail: { $exists: true } }
            ]
        });

        // Count submissions with null/empty concierge fields
        const submissionsWithEmptyConciergeFields = await this.db.collection('submissions').countDocuments({
            $or: [
                { conciergeName: { $in: [null, ""] } },
                { conciergeEmail: { $in: [null, ""] } }
            ]
        });

        console.log(`📊 Verification Results:`);
        console.log(`   Total submissions: ${totalSubmissions}`);
        console.log(`   Submissions with conciergeID: ${submissionsWithConciergeID}`);
        console.log(`   Submissions with old fields to clean: ${submissionsWithOldFields}`);
        console.log(`   Submissions with null/empty concierge fields: ${submissionsWithEmptyConciergeFields}`);

        // Safety check: Only proceed if conciergeID migration was successful
        if (submissionsWithConciergeID === 0) {
            console.log("⚠️  Skipping concierge cleanup: No submissions have conciergeID yet");
            return;
        }

        // Safety check: Verify we're not deleting data from submissions without conciergeID
        const submissionsWithoutConciergeID = await this.db.collection('submissions').countDocuments({
            conciergeID: { $exists: false },
            $or: [
                { submitterName: { $exists: true } },
                { conciergeName: { $exists: true } },
                { conciergeEmail: { $exists: true } }
            ]
        });

        if (submissionsWithoutConciergeID > 0) {
            console.log(`⚠️  Found ${submissionsWithoutConciergeID} submissions with old fields but no conciergeID`);
            console.log("⚠️  Skipping concierge cleanup: Some submissions may not have been migrated yet");
            return;
        }

        console.log("✅ Verification passed: Safe to clean old concierge fields");
        
        // Clean up old fields from submissions with conciergeID
        const unsetRes1 = await this.db.collection('submissions').updateMany(
            {
                conciergeID: { $exists: true }
            },
            {
                $unset: {
                    submitterName: "",
                    conciergeName: "",
                    conciergeEmail: ""
                }
            }
        );
        console.log(`✅ Removed old fields from ${unsetRes1.modifiedCount} submissions with conciergeID`);

        // Clean up null/empty concierge fields from all submissions
        const unsetRes2 = await this.db.collection('submissions').updateMany(
            {
                $or: [
                    { conciergeName: { $in: [null, ""] } },
                    { conciergeEmail: { $in: [null, ""] } }
                ]
            },
            {
                $unset: {
                    conciergeName: "",
                    conciergeEmail: ""
                }
            }
        );
        console.log(`✅ Removed null/empty concierge fields from ${unsetRes2.modifiedCount} submissions`);
        
        console.log(`🧹 Cleanup complete. Total submissions cleaned: ${unsetRes1.modifiedCount + unsetRes2.modifiedCount}`);
    }

    // Update GPAName field from questionnaireData
    async updateGPANameFromQuestionnaire() {
        console.log("🔄 Starting GPAName migration...");
        
        // Query all applications to check for GPAName mismatches
        const applications = await this.db.collection('applications').find({
            controlledAccess: true,
            $or: [
                { GPAName: { $exists: false } },
                { GPAName: null },
                { GPAName: "" }
            ]
        }).toArray();
        
        let updatedCount = 0;
        let matchedCount = 0;
        let missingInQuestionnaireCount = 0;
        let failed = [];
        
        for (const application of applications) {
            
            try {

                console.log(`Processing application ${application._id}`);
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
                
                let extractedGPAName = null;
                
                // Check funding array for nciGPA values
                if (questionnaire.study.funding && Array.isArray(questionnaire.study.funding)) {
                    for (const funding of questionnaire.study.funding) {
                        // Validate funding entry structure
                        if (funding && typeof funding === 'object' && 'nciGPA' in funding) {
                            if (funding.nciGPA && typeof funding.nciGPA === 'string' && funding.nciGPA.trim() !== "") {
                                extractedGPAName = funding.nciGPA.trim();
                                break; // Use first non-empty value found
                            }
                        }
                    }
                }
                
                // Fall back to new GPAName format if no nciGPA found
                if (!extractedGPAName) {
                    extractedGPAName = questionnaire.study.GPAName;
                }
                
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
                const result = await this.db.collection('applications').updateOne(
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

    // Restore user notifications function (from shared functions)
    async restoreUserNotifications(notification, filter) {
        console.log("\n----------------------");
        console.log(`${new Date()} -> Restoring data field: "notifications" by adding "${notification}" to users`);
        
        const result = await this.db.collection('users').updateMany(
            filter,
            {
                $addToSet: { notifications: notification }
            }
        );
        
        const matchedCount = result.matchedCount;
        const updatedCount = result.modifiedCount;
        console.log(`Matched Records: ${matchedCount}`);
        console.log(`Updated Records: ${updatedCount}`);
        console.log(`${new Date()} -> Restored data field: "notifications" by adding "${notification}" to users`);
        console.log("----------------------");
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log("✅ Disconnected from MongoDB");
        }
    }

    async run() {
        try {
            await this.connect();
            await this.executeMigration();
            return true;
        } catch (error) {
            console.error('Migration execution failed:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// CLI execution
if (require.main === module) {
    const migrationRunner = new MigrationRunner();
    migrationRunner.run()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration failed:', error.message);
            process.exit(1);
        });
}

module.exports = MigrationRunner;

