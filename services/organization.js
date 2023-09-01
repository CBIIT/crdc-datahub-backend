const {toISO} = require("../crdc-datahub-database-drivers/utility/time-utility");
class Organization {
    constructor(organizationCollection) {
        this.organizationCollection = organizationCollection;
    }

    async getOrganizationByID(id) {
        let result = await this.organizationCollection.find(id);
        return result?.length > 0 ? transformDateTime(result[0]) : null;
    }
}

const transformDateTime = (aOrg) => {
    if (aOrg?.createdAt) aOrg.createdAt = toISO(aOrg.createdAt);
    if (aOrg?.updateAt) aOrg.updateAt = toISO(aOrg.updateAt);
    return aOrg;
}

module.exports = {
    Organization
};

