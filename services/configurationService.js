const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
PBAC_CONFIG_TYPE = "PBAC";
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

    /**
     * API: getPBTCDDefaults retrieve roles default permissions and notifications.
     * @param {*} params 
     * @param {*} context 
     */
    async getPBACDefaults(params, context){
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.ADMIN]);

        return await this.getPBACByRoles(params.roles);
    }
    /**
     * Get PBAC defaults by roles
     * @param {Array} roles
     * @returns {Object} PBAC defaults
     */
    async getPBACByRoles(roles){
        const result = await this.configurationCollection.aggregate([{
            "$match": { "type": PBAC_CONFIG_TYPE }
        }, {"$limit": 1}]);
        if (!result || result.length === 0){
            return null;
        }
        return (roles.includes("All"))? result[0].Defaults : result[0].Defaults.filter((item)=> roles.includes(item.role));
    }
}

module.exports = {
    ConfigurationService
};