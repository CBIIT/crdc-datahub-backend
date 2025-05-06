// Use the appropriate database
// use crdc-datahub;
// run the shared functions first under the mongosh.
// Restore account:access_change notification to all users
removeUserNotification("data_submission:missing_primary_contact",  {role: {$in: ["Admin", "Data Commons Personnel", "Federal Lead", "Submitter", "User"]}});

// Restore data_submission:created notification to all users
restoreUserNotifications("data_submission:created",  {role: {$in: ["Admin", "Data Commons Personnel"]}});