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
/**
 * removeUserPermissions
 * @param {*} permission 
 * @param {*} filter 
 */
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
/**
 * restoreUserPermissions
 * @param {*} permission 
 * @param {*} filter 
 */
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

/**
 * generateUUIDv4(
 * @returns uuid
 */
function generateUUIDv4() {
            const hexDigits = "0123456789abcdef";
            let uuid = "";
            for (let i = 0; i < 36; i++) {
                if (i === 8 || i === 13 || i === 18 || i === 23) {
                    uuid += "-";
                } else if (i === 14) {
                    uuid += "4"; // set the version to 4
                } else if (i === 19) {
                    uuid += hexDigits.substr((Math.random() * 4) | 8, 1); // set the variant
                } else {
                    uuid += hexDigits.charAt(Math.floor(Math.random() * 16));
                }
            }
            return uuid;
}
