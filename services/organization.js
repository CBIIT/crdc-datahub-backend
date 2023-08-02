class Organization {
    constructor(organizationCollection) {
        this.organizationCollection = organizationCollection;
    }

    // Query the organization collection to find the curator or owner based on the user ID.
    async getOrganization(userID) {
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
        return result?.length > 0 ? result : [];
    }

    async getOrganizationByID(id) {
        let result = await this.organizationCollection.find(id);
        return result?.length > 0 ? result[0] : null;
    }
}

module.exports = {
    Organization
};

