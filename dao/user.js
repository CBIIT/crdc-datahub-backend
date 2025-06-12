const prisma = require("../prisma");
class UserDAO{
    async findById(id) {
         const user = await prisma.user.findUnique({where: {id: id}})
         if (!user) {
            return null
        }
        return {...user, _id: user.id}
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