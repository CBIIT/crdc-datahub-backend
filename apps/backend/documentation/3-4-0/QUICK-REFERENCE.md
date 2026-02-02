# 3.4.0 Migration Quick Reference

## 🚀 Quick Start Checklist

### Pre-Migration
- [ ] Database backup created
- [ ] "NA" program exists: `db.organization.findOne({name: "NA"})`
- [ ] Test environment verified
- [ ] Maintenance window scheduled

### Execution Order (5 Phases)
1. **Foundation Setup** (5-10 min)
2. **User Management** (10-15 min)  
3. **Study/Organization** (15-30 min)
4. **Submission Data** (20-40 min)
5. **Configuration** (10-20 min)

---

## 📋 Phase-by-Phase Commands

### Phase 1: Foundation Setup
```javascript
// 1.1 Database Selection
use crdc-datahub2  // DEV2/QA2
use crdc-datahub   // Others

// 1.2 Collection Creation
db.createCollection("pendingPvs");

// 1.3 Data Commons Lookup
db.dataCommons.insertOne({
  "_id": "4245e09e-52eb-42b6-85e9-a3a23539994f",
  "dataCommons": "CDS",
  "dataCommonsDisplayName": "GC"
});
```

### Phase 2: User Management
```bash
# 2.1 User Full Name
load('user-full-name.js');

# 2.2 NIH User Reactivation  
load('reactivate-nih-users.js');

# 2.3 User Notifications
db.users.updateMany(
  { role: {$in: ["Data Commons Personnel"]} },
  { $addToSet: { notifications: "data_submission:pv_requested" } }
);

db.users.updateMany(
  { role: {$in: ["User", "Submitter"]} },
  { $addToSet: { notifications: "submission_request:pending_cleared" } }
);
```

### Phase 3: Study/Organization Management
```bash
# 3.1 Orphan Studies
load('orphanApprovedStudies.js');

# 3.2 Attach Study ID (Updated - Idempotent)
load('attachStudyIDSubmission.js');

# 3.3 Overwrite Program ID (Updated - Idempotent)
load('overwriteAllProgramID.js');
```

### Phase 4: Submission Data Migration
```bash
# 4.1 Store Concierge ID (Updated - Idempotent)
load('storeConciergeIDSubmission.js');

# 4.2 Entity Type Value
load('setEntityTypeValueInRelease.js');

# 4.3 Concierge Cleanup (Manual - Run after verification)
cleanupOldConciergeFields();
```

### Phase 5: Configuration & Cleanup
```javascript
// 5.1 OMB Configuration
db.configuration.updateOne(
  { type: "OMB_INFO" },
  {
    $set: {
      OMBInfo: ["Collection of this information is authorized..."],
      OMBNumber: "0925-7775",
      expirationDate: { "$date": "2025-06-30T00:00:00.000Z" },
      type: "OMB_INFO"
    }
  },
  { upsert: true }
);

// 5.2 Application Restructuring (Updated - Idempotent)
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

// 5.3 Inactive Reminder Flags
db.applications.updateMany({}, [
  {
    $set: {
      inactiveReminder: { $ifNull: ["$inactiveReminder", false] },
      inactiveReminder_7: { $ifNull: ["$inactiveReminder_7", false] },
      inactiveReminder_15: { $ifNull: ["$inactiveReminder_15", false] },
      inactiveReminder_30: { $ifNull: ["$inactiveReminder_30", false] },
      finalInactiveReminder: { $ifNull: ["$finalInactiveReminder", false] }
    }
  }
]);

db.submissions.updateMany({}, [
  {
    $set: {
      inactiveReminder_7: { $ifNull: ["$inactiveReminder_7", false] },
      inactiveReminder_30: { $ifNull: ["$inactiveReminder_30", false] },
      inactiveReminder_60: { $ifNull: ["$inactiveReminder_60", false] },
      finalInactiveReminder: { $ifNull: ["$finalInactiveReminder", false] }
    }
  }
]);

// 5.4 Cleanup Operations
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

db.submissions.updateMany(
  { "collaborators.Organization": {$exists: true} },
  { $unset: { "collaborators.$[].Organization": "" } }
);

db.organization.updateMany(
  {updatedAt: {$exists: true}}, 
  { $unset: { updatedAt: "" } }
);

// 5.5 Notification Adjustments
db.users.updateMany(
  { role: {$in: ["Data Commons Personnel", "Submitter"]} },
  { $addToSet: { notifications: "data_submission:cfg_changed" } }
);

db.users.updateMany(
  { role: "Submitter" },
  { $pull: { notifications: "data_submission:cfg_changed" } }
);

// 5.6 Date Conversion (QA2 Only)
db.users.updateMany(
  { createdAt: { $type: "string" } },
  [{ $set: { createdAt: { $toDate: "$createdAt" } } }]
);

db.users.updateMany(
  { updateAt: { $type: "string" } },
  [{ $set: { updateAt: { $toDate: "$updateAt" } } }]
);

// 5.7 Restore Notification SR
load('restoreNewNotificationSR.js');
```

---

## ✅ Idempotency Status

| Migration | Status | Notes |
|-----------|--------|-------|
| attachStudyIDSubmission.js | ✅ **Updated** | Only processes invalid/missing studyID |
| overwriteAllProgramID.js | ✅ **Updated** | Only processes invalid/missing programID |
| storeConciergeIDSubmission.js | ✅ **Updated** | Only processes missing conciergeID |
| Application Restructuring | ✅ **Updated** | Only processes missing root applicantID |
| All Others | ✅ **Already Idempotent** | Safe to run multiple times |

---

## 🔍 Verification Commands

### Quick Health Check
```javascript
// Document counts
db.users.countDocuments();
db.submissions.countDocuments();
db.applications.countDocuments();

// Field existence checks
db.submissions.find({studyID: {$exists: true}}).count();
db.submissions.find({programID: {$exists: true}}).count();
db.submissions.find({conciergeID: {$exists: true}}).count();
db.applications.find({applicantID: {$exists: true}}).count();
```

### UUID Format Validation
```javascript
// Valid UUID pattern check
db.submissions.find({
  studyID: {$regex: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i}
}).count();
```

### Application Structure Check
```javascript
// Should be 0 after migration
db.applications.find({"applicant.applicantID": {$exists: true}}).count();
```

---

## 🚨 Emergency Procedures

### If Migration Fails
1. **Check logs** for specific errors
2. **Verify prerequisites** (NA program, shared functions)
3. **Re-run individual migrations** (all are idempotent)
4. **Contact development team** if issues persist

### Emergency Rollback
1. **Stop application** services
2. **Restore database** from backup
3. **Verify data integrity**
4. **Restart services**

---

## 📞 Support

- **Documentation**: See `MIGRATION-EXECUTION-GUIDE.md` for detailed instructions
- **Issues**: All migrations are idempotent - safe to re-run
- **Escalation**: Contact development team for complex issues

---

**⚡ Quick Tip**: All updated migrations can be safely re-run if needed. The idempotency updates ensure no data is overwritten unnecessarily.
