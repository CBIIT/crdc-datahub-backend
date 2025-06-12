const prisma = require("../prisma");

class SubmissionDAO{
    async findById(id) {
         const submission = await prisma.submission.findUnique({where: {id: id}})
         if (!submission) {
            return null
        }
        return {...submission, _id: submission.id}
    }
}

module.exports = SubmissionDAO