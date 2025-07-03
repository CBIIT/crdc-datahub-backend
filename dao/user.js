const prisma = require("../prisma");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
class UserDAO {
    constructor() {
    }
    /**
     * Finds an application associated with a given submission ID.
     *
     * @param {string} userID - The ID of the submission to query.
     * @returns {Promise<User>} - A promise that resolves to an array of pending PV records.
     */
    // TODO this should be removed after generic dao created
    async findByID(userID) {
        const res = await prisma.user.findUnique({
            where: { id: userID }
        });
        return res ? { ...res, _id: res.id } : null;
    }

    async getUsersByNotifications(notifications, roles = []) {
        const where = {
            userStatus: USER.STATUSES.ACTIVE,
            notifications: {
                hasSome: notifications,
            },
            ...(roles.length > 0 && { role: { in: roles } }),
        };
        const users = await prisma.user.findMany({ where });
        return users.map(user => ({ ...user, _id: user.id }));
    }
}

module.exports = UserDAO