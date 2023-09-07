class Organization {
    constructor(organizationCollection) {
        this.organizationCollection = organizationCollection;
    }

    async getOrganizationByID(id) {
        let result = await this.organizationCollection.find(id);
        return result?.length > 0 ? result[0] : null;
    }
}

module.exports = {
    Organization
};

