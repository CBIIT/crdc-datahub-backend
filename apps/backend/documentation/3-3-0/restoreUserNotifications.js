// Use the appropriate database
// use crdc-datahub;

// run related shared function first before call the function under mogosh
// Restore account:access_change notification to all users
restoreUserNotifications("account:access_changed",  {role: {$in: ["Admin", "Data Commons Personnel", "Federal Lead", "Submitter", "User"]}});

// Restore data_submission:missing_primary_contact notification to admin users 
restoreUserNotifications("data_submission:missing_primary_contact", { "role": "Admin" });

