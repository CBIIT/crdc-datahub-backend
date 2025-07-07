const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
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
}
module.exports = UserDAO