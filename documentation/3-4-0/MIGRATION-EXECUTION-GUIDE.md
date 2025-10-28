# 3.4.0 Migration Execution Guide

## Overview
This guide provides the complete execution order and procedures for the 3.4.0 release migrations. All migrations have been updated to be **idempotent** (safe to run multiple times without side effects).

## Pre-Migration Checklist

### Environment Preparation
- [ ] **Database Backup**: Create full backup of production database
- [ ] **Test Environment**: Verify all migrations work in test environment
- [ ] **Maintenance Window**: Schedule appropriate downtime
- [ ] **Rollback Plan**: Document rollback procedures
- [ ] **Monitoring**: Set up database monitoring during migration

### Prerequisites
- [ ] **"NA" Program**: Ensure organization with name "NA" exists
- [ ] **Shared Functions**: `sharedFunctions/restoreUserNotifications.js` available
- [ ] **Database Access**: MongoDB shell access with write permissions
- [ ] **Migration Scripts**: All updated migration files ready

## Migration Execution Order

### **Phase 1: Foundation Setup** (Run First)
**Risk Level**: 🟢 Low  
**Estimated Time**: 5-10 minutes

#### 1.1 Database Selection
```javascript
// For DEV2 or QA2
use crdc-datahub2

// For all other tiers  
use crdc-datahub
```

#### 1.2 Collection Creation
```javascript
// Create pendingPVs collection (idempotent - ignores if exists)
db.createCollection("pendingPvs");
```

#### 1.3 Data Commons Lookup
```javascript
// Insert dataCommons display name mapping (idempotent - uses specific _id)
db.dataCommons.insertOne({
  "_id": "4245e09e-52eb-42b6-85e9-a3a23539994f",
  "dataCommons": "CDS",
  "dataCommonsDisplayName": "GC"
});
```

---

### **Phase 2: User Management** (Early Dependencies)
**Risk Level**: 🟢 Low  
**Estimated Time**: 10-15 minutes

#### 2.1 User Full Name Migration
```bash
# Run the updated script
load('user-full-name.js');
```
**Idempotent**: ✅ Only updates users without `fullName` field

#### 2.2 NIH User Reactivation
```bash
# Run the script
load('reactivate-nih-users.js');
```
**Idempotent**: ✅ Safe to set Active status multiple times

#### 2.3 User Notifications Setup
```javascript
// Add data_submission:pv_requested to Data Commons Personnel (idempotent)
db.users.updateMany(
  { role: {$in: ["Data Commons Personnel"]} },
  { $addToSet: { notifications: "data_submission:pv_requested" } }
);

// Add submission_request:pending_cleared to User/Submitter roles (idempotent)
db.users.updateMany(
  { role: {$in: ["User", "Submitter"]} },
  { $addToSet: { notifications: "submission_request:pending_cleared" } }
);
```

---

### **Phase 3: Study and Organization Management** (Core Data Relationships)
**Risk Level**: 🟡 Medium  
**Estimated Time**: 15-30 minutes

#### 3.1 Orphan Approved Studies Migration
```bash
# Run the script
load('orphanApprovedStudies.js');
```
**Idempotent**: ✅ Uses `$addToSet` - won't duplicate studies  
**Dependency**: Requires "NA" program to exist

#### 3.2 Attach Study ID to Submissions
```bash
# Run the updated script with UUID validation
load('attachStudyIDSubmission.js');
```
**Idempotent**: ✅ Only processes submissions without valid UUID `studyID`  
**Dependency**: Requires `approvedStudies` collection

#### 3.3 Overwrite Program ID
```bash
# Run the updated script with existence check
load('overwriteAllProgramID.js');
```
**Idempotent**: ✅ Only processes submissions without valid UUID `programID`  
**Dependency**: Requires `studyID` to be set (depends on 3.2)

---

### **Phase 4: Submission Data Migration** (Data Transformation)
**Risk Level**: 🟡 Medium  
**Estimated Time**: 20-40 minutes

#### 4.1 Store Concierge ID Migration
```bash
# Run the updated script
load('storeConciergeIDSubmission.js');
```
**Idempotent**: ✅ Only processes submissions without `conciergeID`  
**Dependency**: Requires `users` collection

#### 4.2 Set Entity Type Value in Release
```bash
# Run the script
load('setEntityTypeValueInRelease.js');
```
**Idempotent**: ✅ Only affects documents where `entityType` is an array

#### 4.3 Concierge Cleanup (Manual Step)
```javascript
// Run ONLY after migration verification
cleanupOldConciergeFields();
```
**Idempotent**: ✅ Only cleans up submissions with existing `conciergeID`

---

### **Phase 5: Configuration and Cleanup** (Final Steps)
**Risk Level**: 🟢 Low  
**Estimated Time**: 10-20 minutes

#### 5.1 OMB Configuration
```javascript
// Add OMB information (idempotent - uses upsert)
db.configuration.updateOne(
  { type: "OMB_INFO" },
  {
    $set: {
      OMBInfo: [
        "Collection of this information is authorized by The Public Health Service Act, Section 411 (42 USC 285a)...",
        "Public reporting burden for this collection of information is estimated to average 60 minutes per response..."
      ],
      OMBNumber: "0925-7775",
      expirationDate: { "$date": "2025-06-30T00:00:00.000Z" },
      type: "OMB_INFO"
    }
  },
  { upsert: true }
);
```

#### 5.2 Application Data Restructuring
```javascript
// Move applicantID to root level (idempotent)
db.applications.updateMany(
  { 
    "applicant.applicantID": { $exists: true },
    "applicantID": { $exists: false }
  },
  [
    { $set: { applicantID: "$applicant.applicantID" } },
    { $unset: "applicant" }
  ]
);
```

#### 5.3 Inactive Reminder Flags
```javascript
// Add default flags to applications (idempotent)
db.applications.updateMany(
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

// Add default flags to submissions (idempotent)
db.submissions.updateMany(
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
```

#### 5.4 Cleanup Operations
```javascript
// Remove empty organizations (idempotent)
db.users.updateMany(
  { organization: { $type: "object", $eq: {} } },
  { $unset: { organization: "" } }
);

db.applications.updateMany(
  {
    $or: [
      { organization: { $type: "object", $eq: {} } },
      { "organization._id": null }
    ]
  },
  { $unset: { organization: "" } }
);

// Remove empty collaborators (idempotent)
db.submissions.updateMany(
  { "collaborators.Organization": {$exists: true} },
  { $unset: { "collaborators.$[].Organization": "" } }
);

// Remove updatedAt from organization collection (idempotent)
db.organization.updateMany(
  {updatedAt: {$exists: true}}, 
  { $unset: { updatedAt: "" } }
);
```

#### 5.5 Notification Adjustments
```javascript
// Add configuration change notification (idempotent)
db.users.updateMany(
  { role: {$in: ["Data Commons Personnel", "Submitter"]} },
  { $addToSet: { notifications: "data_submission:cfg_changed" } }
);

// Remove configuration change notification from Submitter role (idempotent)
db.users.updateMany(
  { role: "Submitter" },
  { $pull: { notifications: "data_submission:cfg_changed" } }
);
```

#### 5.6 Date Type Conversion (QA2 Only)
```javascript
// Convert string dates to DateTime (QA2 only - idempotent)
db.users.updateMany(
  { createdAt: { $type: "string" } },
  [{ $set: { createdAt: { $toDate: "$createdAt" } } }]
);

db.users.updateMany(
  { updateAt: { $type: "string" } },
  [{ $set: { updateAt: { $toDate: "$updateAt" } } }]
);
```

#### 5.7 Restore New Notification SR
```bash
# Run the script (requires shared function)
load('restoreNewNotificationSR.js');
```
**Idempotent**: ✅ Uses idempotent shared function  
**Dependency**: Requires `sharedFunctions/restoreUserNotifications.js`

---

## Idempotency Summary

### ✅ **Fully Idempotent Migrations**
- Database selection
- Collection creation
- Data Commons lookup
- User full name migration
- NIH user reactivation
- User notifications
- Orphan approved studies
- Entity type value conversion
- OMB configuration
- Inactive reminder flags
- Cleanup operations
- Notification adjustments
- Date type conversion
- Restore new notification SR

### ✅ **Updated to be Idempotent**
- **attachStudyIDSubmission.js**: Only processes submissions without valid UUID `studyID`
- **overwriteAllProgramID.js**: Only processes submissions without valid UUID `programID`
- **storeConciergeIDSubmission.js**: Only processes submissions without `conciergeID`
- **Application restructuring**: Only processes applications without root `applicantID`

## Risk Assessment by Phase

| Phase | Risk Level | Dependencies | Rollback Complexity |
|-------|------------|--------------|-------------------|
| 1. Foundation | 🟢 Low | None | Easy |
| 2. User Management | 🟢 Low | None | Easy |
| 3. Study/Organization | 🟡 Medium | "NA" program, approvedStudies | Medium |
| 4. Submission Data | 🟡 Medium | Users collection | Medium |
| 5. Configuration | 🟢 Low | Shared functions | Easy |

## Troubleshooting

### Common Issues

#### Missing "NA" Program
```javascript
// Create NA program if missing
db.organization.insertOne({
  name: "NA",
  studies: []
});
```

#### Shared Function Not Found
```javascript
// Verify shared function exists
load('sharedFunctions/restoreUserNotifications.js');
```

#### Migration Fails Partway
- All migrations are idempotent - safe to re-run
- Check logs for specific error messages
- Verify prerequisites are met
- Run individual migrations to isolate issues

### Verification Steps

#### After Each Phase
```javascript
// Check document counts
db.users.countDocuments();
db.submissions.countDocuments();
db.applications.countDocuments();

// Verify specific field updates
db.submissions.find({studyID: {$exists: true}}).count();
db.submissions.find({programID: {$exists: true}}).count();
db.submissions.find({conciergeID: {$exists: true}}).count();
```

#### Final Verification
```javascript
// Verify UUID formats
db.submissions.find({
  studyID: {$regex: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i}
}).count();

// Check application structure
db.applications.find({applicantID: {$exists: true}}).count();
db.applications.find({"applicant.applicantID": {$exists: true}}).count();
```

## Post-Migration Checklist

- [ ] All migrations completed successfully
- [ ] Document counts verified
- [ ] UUID formats validated
- [ ] Application structure verified
- [ ] User notifications updated
- [ ] Configuration data added
- [ ] Cleanup operations completed
- [ ] Application functionality tested
- [ ] Database performance monitored
- [ ] Rollback procedures documented

## Support and Escalation

### If Issues Arise
1. **Check logs** for specific error messages
2. **Verify prerequisites** are met
3. **Run individual migrations** to isolate issues
4. **Consult this guide** for troubleshooting steps
5. **Contact development team** for complex issues

### Emergency Rollback
1. **Stop application** services
2. **Restore database** from backup
3. **Verify data integrity**
4. **Restart application** services
5. **Document incident** for future reference

---

**Note**: All migrations have been tested for idempotency and can be safely re-run if needed. Always test in a non-production environment first.
