const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class ValidationDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.VALIDATION);
    }
}

module.exports = ValidationDAO