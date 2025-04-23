// Use the appropriate database
// use crdc-datahub;

// Function to restore user notifications by adding new notification to users
function restoreUserNotifications(notification, filter) {
    let matchedCount = 0;
    let updatedCount = 0;
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> Restoring data field: "notifications" by adding "${notification}" to users`);
    result = db.users.updateMany(
        filter,
        {
            $addToSet: { notifications: notification}
        }
    );
    matchedCount = result.matchedCount;
    updatedCount = result.modifiedCount;
    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
    console.log(`${new Date()} -> Restored data field: "notifications" by adding "${notification}" to users`);
    print("----------------------");
    print("\n");
}
  
// Function to restore user notifications by adding new notification to users
function removeUserNotification(notification, filter) {
    let matchedCount = 0;
    let updatedCount = 0;
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> Update data field: "notifications" by removing "${notification}" to users`);
    // remove given notification from user.notifications
    result = db.users.updateMany(
        filter,
        {
            $pull: { notifications: notification}
        }
    );
    matchedCount = result.matchedCount;
    updatedCount = result.modifiedCount;
    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
    console.log(`${new Date()} -> Update data field: "notifications" by removing "${notification}" to users`);
    print("----------------------");
    print("\n");
}
  
// Restore account:access_change notification to all users
removeUserNotification("data_submission:missing_primary_contact",  {role: {$in: ["Admin", "Data Commons Personnel", "Federal Lead", "Submitter", "User"]}});

// Restore account:access_change notification to all users
// restoreUserNotifications("account:access_changed",  {role: {$in: ["Admin", "Data Commons Personnel", "Federal Lead", "Submitter", "User"]}});