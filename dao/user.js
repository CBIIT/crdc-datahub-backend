const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
class UserDAO extends GenericDAO {
    constructor(userCollection) {
        super(MODEL_NAME.USER);
        this.userCollection = userCollection;
    }
    // TODO double check
    async updateUserOrg(orgID, updatedOrg) {
        await this.userCollection.updateMany(
            {"organization.orgID": orgID, "organization.orgName": {"$ne": updatedOrg.name}},
            {
                "organization.orgName": updatedOrg.name,
                "organization.updateAt": updatedOrg.updateAt,
                updateAt: getCurrentTime()
            }
        )
    }
}
module.exports = UserDAO