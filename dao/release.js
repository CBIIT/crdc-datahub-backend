const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class ReleaseDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.VALIDATION);
    }
}

module.exports = ReleaseDAO