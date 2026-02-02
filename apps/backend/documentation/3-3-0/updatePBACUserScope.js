/**
 * updatePBACNewScope
 * @param {*} version
 */
function updatePBACNewScope(version) {

    const config = db.configuration.findOne({ type: "PBAC", version: version });

    const rolePermissionMap = {};
    config.Defaults.forEach(roleDef => {
        rolePermissionMap[roleDef.role] = roleDef.permissions.map(p => p._id);
    });

    const users = db.users.find({ role: { $exists: true }, permissions: { $exists: true } }).toArray();
    const matchedCount = users.length;
    let updatedCount = 0;
    users.forEach(user => {
        const defaultPerms = rolePermissionMap[user.role];
        if (!defaultPerms) {
            return;
        }

        const groupMap = {};
        defaultPerms.forEach(p => {
            const parts = p.split(":");
            if (parts.length >= 2) {
                const key = `${parts[0]}:${parts[1]}`;
                if (!groupMap[key]) {
                    groupMap[key] = [];
                }
                groupMap[key].push(p);
            }
        });
        // Match user permissions based on prefix + group
        const newPermissions = user.permissions.map(oldPerm => {
            const parts = oldPerm.split(":");
            if (parts.length < 2) {
                console.error(`The user ID ${user._id} has a unknown permission, please check the user's permission; ${oldPerm}`);
                return null;
            }
            const key = `${parts[0]}:${parts[1]}`;
            const candidates = groupMap[key];
            if (!candidates) {
                console.error(`The user ID ${user._id} permission is properly configured, please check the user's permission`, `ID: ${user._id}`, `permission: ${oldPerm}`);
                return null;
            }
            return candidates[0];
        }).filter(Boolean); // remove nulls


        if (user.permissions?.length === newPermissions?.length) {
            // Update the document if there's a change
            const res = db.users.updateOne(
                { _id: user._id },
                { $set: { permissions: newPermissions } }
            );
            if (res.modifiedCount > 0) {
                updatedCount += 1;
            }
        } else {
            console.error("The user permission is not updated, please check the user's permission", `ID: ${user._id}`, `permissions: ${user.permissions}`, `new-permissions: ${newPermissions}`);
        }
    });

    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
}

updatePBACNewScope("2.0.0");