class Organization {
    constructor(organizationCollection) {
        this.organizationCollection = organizationCollection;
    }

    async getOrganizationByID(id) {
        let result = await this.organizationCollection.find(id);
        return result?.length > 0 ? toISOTime(result[0]) : null;
    }
}

const toISOTime = (aOrg) => {
    if (aOrg?.createdAt) aOrg.createdAt = toISO(aOrg.createdAt);
    if (aOrg?.updateAt) aOrg.updateAt = toISO(aOrg.updateAt);
    return aOrg;
}

module.exports = {
    Organization
};

