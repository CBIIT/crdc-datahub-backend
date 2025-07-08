const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");

class ApplicationDAO extends GenericDAO {
    constructor(applicationCollection) {
        super(MODEL_NAME.SUBMISSION_REQUEST);
        this.applicationCollection = applicationCollection;
    }
    // Prisma can't join _id in the object.
    async updateApplicationOrg(orgID, updatedOrg){
        return await this.applicationCollection.updateMany(
            {"organization._id": orgID, "organization.name": {"$ne": updatedOrg.name}},
            {"organization.name": updatedOrg.name, updatedAt: getCurrentTime()}
        )
    }
}

module.exports = ApplicationDAO