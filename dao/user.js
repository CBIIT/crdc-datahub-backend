const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
class UserDAO extends GenericDAO {
    constructor(userCollection) {
        super(MODEL_NAME.USER);
        this.userCollection = userCollection;
    }

    async updateUserOrg(orgID, updatedOrg) {
        return await this.userCollection.updateMany(
            {"organization.orgID": orgID, "organization.orgName": {"$ne": updatedOrg.name}},
            {
                "organization.orgName": updatedOrg.name,
                "organization.updateAt": updatedOrg.updateAt,
                updateAt: getCurrentTime()
            }
        )
    }

    async findByIdAndStatus(id, userStatus) {
        const user = await prisma.user.findUnique({where: {id: id, userStatus: userStatus}})
        if (!user) {
            return null
        }
        return {...user, _id: user.id}
    }

    async getUsersByNotifications(notifications, roles = []) {
        // Currently, generic DAO findMany does not support native hasSome; this should be improved.
        const users = await prisma.user.findMany({where:
            {
                userStatus: USER.STATUSES.ACTIVE,
                notifications: {
                hasSome: notifications,
            },
            ...(roles.length > 0 && { role: { in: roles } }),
        }});
        return users.map(user => ({ ...user, _id: user.id }));
    }

    /**
     * Fetch multiple users by their IDs in a single database query
     * @param {string[]} userIDs - Array of user IDs to fetch
     * @returns {Promise<Array>} - Array of user objects
     */
    async findManyByIds(userIDs) {
        if (!userIDs || userIDs.length === 0) {
            return [];
        }
        
        const users = await prisma.user.findMany({
            where: {
                id: { in: userIDs }
            }
        });
        
        return users.map(user => ({ ...user, _id: user.id }));
    }
}

module.exports = UserDAO