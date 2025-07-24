const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class DataRecordDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.DATA_RECORDS);
    }
}

module.exports = DataRecordDAO