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
        await this.userCollection.updateMany(
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
        const where = {
            userStatus: USER.STATUSES.ACTIVE,
            notifications: {
                hasSome: notifications,
            },
            ...(roles.length > 0 && { role: { in: roles } }),
        };
        const users = await this.findMany( where );
        return users.map(user => ({ ...user, _id: user.id }));
    }
}

module.exports = UserDAO