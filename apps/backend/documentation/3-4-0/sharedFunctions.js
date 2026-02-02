/**
 * restoreUserNotifications
 * @param {*} notification 
 * @param {*} filter 
 */
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
/**
 * removeUserNotification
 * @param {*} notification 
 * @param {*} filter 
 */
function removeUserNotification(notification, filter) {
            let matchedCount = 0;
            let updatedCount = 0;
            print("\n");
            print("----------------------");
            console.log(`${new Date()} -> Removing data field: "notifications" by removing "${notification}" from users`);
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
            console.log(`${new Date()} -> Removed data field: "notifications" by removing "${notification}" from users`);
            print("----------------------");
            print("\n");     
}
