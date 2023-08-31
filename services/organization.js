const {toISO} = require("../crdc-datahub-database-drivers/utility/time-utility");
class Organization {
    constructor(organizationCollection) {
        this.organizationCollection = organizationCollection;
    }

    // Query the organization collection to find the curator or owner based on the user ID.
    async getOrganizationByUserID(userID) {
        const matchOwnerOrCurator = [{"$match": {
            $or: [
                {curators: {
                    $elemMatch: {
                        $eq: userID
                }}},
                {owner: userID}
                ]
        }}];
        const result = await this.organizationCollection.aggregate(matchOwnerOrCurator);
        return result?.length > 0 ? ((result).map((org)=>(toISOTime(org)))) : [];
    }

    async getOrganizationByID(id) {
        let result = await this.organizationCollection.find(id);
        return result?.length > 0 ? toISOTime(result[0]) : null;
    }
}

const toISOTime = (aOrg) => {
    if (aOrg?.createdAt) aOrg.createdAt = toISO(aOrg.createdAt);
    if (aOrg?.updatedAt) aOrg.updatedAt = toISO(aOrg.updatedAt);
    return aOrg;
}

module.exports = {
    Organization
};

