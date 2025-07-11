const {MODEL_NAME} = require("../constants/db-constants");
const GenericDAO = require("./generic");
class ApplicationDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.APPLICATION);
    }
}

module.exports = ApplicationDAO