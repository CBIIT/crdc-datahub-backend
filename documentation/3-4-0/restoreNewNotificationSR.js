// 3.4.0 Notification SR Restore Script
// This script restores the submission_request:pending_cleared notification
// Can be run standalone or as part of the main migration

// Load the shared function first
load('sharedFunctions.js');

// Restore submission_request:pending_cleared notification to Submitter and User roles
console.log("🔔 Restoring notification SR...");
restoreUserNotifications("submission_request:pending_cleared", { role: { $in: ["Submitter", "User"] } });

console.log("✅ Notification SR restore completed");