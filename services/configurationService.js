class ConfigurationService {
    constructor(configurationCollection) {
        this.configurationCollection = configurationCollection;
    }

    async findByType(type) {
        const result = await this.configurationCollection.aggregate([{
            "$match": { type }
        }, {"$limit": 1}]);
        return (result?.length === 1) ? result[0] : null;
    }
}

module.exports = {
    ConfigurationService
};