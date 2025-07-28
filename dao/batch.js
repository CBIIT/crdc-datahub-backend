const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class BatchDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.BATCH);
    }
}

module.exports = BatchDAO