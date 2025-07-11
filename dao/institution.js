
const { MODEL_NAME} = require('../constants/db-constants');
const GenericDAO = require("./generic");
class InstitutionDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.INSTITUTIONS);
    }
}
module.exports = InstitutionDAO