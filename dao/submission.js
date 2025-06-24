const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');

class SubmissionDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.SUBMISSION);
    }
    async findById(id) {
         const submission = await prisma.submission.findUnique({where: {id: id}})
         if (!submission) {
            return null
        }
        return {...submission, _id: submission.id}
    }
}

module.exports = SubmissionDAO