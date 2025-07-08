const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
class UserDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.USER);
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