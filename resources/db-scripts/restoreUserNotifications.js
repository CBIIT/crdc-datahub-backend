// Use the appropriate database
// use crdc-datahub;
  
// Function to restore user notifications by adding new notification to users
function restoreUserNotifications(notification, filter = {}) {
    const bulkOps = [];
    let matchedCount = 0;
    let updatedCount = 0;
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> Restoring data field: "notifications" by adding "${notification}" to users`);
    db.users.find(filter).forEach(doc => {
        matchedCount++;
        let _notifications = doc["notifications"] || [];
        if (!_notifications.includes(notification)) {
            _notifications.push(notification);
            bulkOps.push({
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $set: {"notifications": _notifications} }
                }
            });
            updatedCount++;
        }
    });

    if (bulkOps.length > 0) {
        db.users.bulkWrite(bulkOps);
    }

    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
    console.log(`${new Date()} -> Restored data field: "notifications" by adding "${notification}" t0 users`);
    print("----------------------");
    print("\n");
}
  
// Restore account:access_change notification to all users
restoreUserNotifications("account:access_change");

// Restore data_submission:missing_primary_contact notification to admin users 
restoreUserNotifications("data_submission:missing_primary_contact", { "role": "Admin" });

