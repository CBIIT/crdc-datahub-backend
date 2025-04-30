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
// Remove user's permission by filter
function removeUserPermissions(permission, filter) {
    let matchedCount = 0;
    let updatedCount = 0;
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> Update data field: "notifications" by removing "${permission}" to users`);
    // remove given notification from user.notifications
    result = db.users.updateMany(
        filter,
        {
            $pull: { permissions: permission}
        }
    );
    matchedCount = result.matchedCount;
    updatedCount = result.modifiedCount;
    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
    console.log(`${new Date()} -> Update data field: "permissions" by removing "${permission}" to users`);
    print("----------------------");
    print("\n");
}

// Function to restore user permissions by adding new default permission to users
function restoreUserPermissions(permission, filter) {
    let matchedCount = 0;
    let updatedCount = 0;
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> Restoring data field: "permissions" by adding "${permission}" to users`);
    result = db.users.updateMany(
        filter,
        {
            $addToSet: { permissions: permission}
        }
    );
    matchedCount = result.matchedCount;
    updatedCount = result.modifiedCount;
    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
    console.log(`${new Date()} -> Restored data field: "permissions" by adding "${permission}" to users`);
    print("----------------------");
    print("\n");
}

// remove default notifications for federal leader, 
// submission_request:to_be_reviewed
// submission_request:reviewed
// submission_request:canceled
// submission_request:expiring
// submission_request:deleted
removeUserNotification("submission_request:to_be_reviewed",  {role: "Federal Lead"});
removeUserNotification("submission_request:reviewed", {role: "Federal Lead"});
removeUserNotification("submission_request:canceled", {role: "Federal Lead"});
removeUserNotification("submission_request:expiring", {role: "Federal Lead"});
removeUserNotification("submission_request:deleted", {role: "Federal Lead"});

// remove default permissions for federal leader,
// submission_request:cancel
removeUserPermissions("submission_request:cancel", {role: "Federal Lead"});

// restore default permissions for federal leader,
// submission_request:submit
restoreUserPermissions("submission_request:submit", {role: "Federal Lead"});





