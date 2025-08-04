const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");

class QCResultDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.QC_RESULT);
    }
}

module.exports = QCResultDAO