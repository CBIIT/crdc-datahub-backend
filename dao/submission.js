const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');

class SubmissionDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.SUBMISSION);
    }
}

module.exports = SubmissionDAO