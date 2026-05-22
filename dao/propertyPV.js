class PropertyPVDAO {
    constructor(collection) {
        this.collection = collection;
    }

    /**
     * @param {string[]} propertyNames non-empty deduped list
     * @param {string} version
     * @param {string} model
     * @returns {Promise<Object[]>}
     */
    async findByPropertiesVersionAndModel(propertyNames, version, model) {
        if (!propertyNames.length) {
            return [];
        }
        return await this.collection.aggregate([
            {
                $match: {
                    property: { $in: propertyNames },
                    version,
                    model
                }
            },
            {
                $project: {
                    id: '$_id',
                    property: '$property',
                    model: '$model',
                    version: '$version',
                    permissibleValues: '$PermissibleValues',
                    createdAt: '$createdAt',
                    updatedAt: '$updatedAt',
                }
            }
        ]);
    }
}

module.exports = PropertyPVDAO;
