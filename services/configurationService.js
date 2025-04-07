const {verifySession} = require("../verifier/user-info-verifier");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const PBAC_CONFIG_TYPE = "PBAC";
const CLI_UPLOADER_VERSION = "CLI_UPLOADER_VERSION";
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
            .verifyInitialized();

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

    /**
     * Get User Permission Access by a role
     * UserAccessControl class to filter permissions.
     * @param {String} role - a user role.
     * @returns {Promise<{ permissions: {disabled: Array, permitted: Array}, notifications: {disabled: Array, permitted: Array} }> | null}
     */
    async getAccessControl(role) {
        const usersPermissions = await this.getPBACByRoles([role]);
        if (usersPermissions?.length === 0) {
            return null;
        }
        // Only one user
        return {
            permissions: UserAccessControl.get(usersPermissions[0]?.permissions),
            notifications: UserAccessControl.get(usersPermissions[0]?.notifications)
        };
    }

    async  retrieveCLIUploaderVersion(params, context) {
        verifySession(context)
            .verifyInitialized();
        return await this.getCurrentCLIUploaderVersion();
    }

    async getCurrentCLIUploaderVersion() {
        const result = await this.configurationCollection.aggregate([{
            "$match": { "type": CLI_UPLOADER_VERSION }
        }, {"$limit": 1}]);
        return (result?.length === 1) ? result[0]?.current_version : null;
    }
}

class UserAccessControl {
    constructor(permissions) {
        this.permssions = permissions;
    }
    /**
     * UserAccessControl class to filter permissions.
     * @param {Array} permissions - List of user permissions.
     * @returns {{ disabled: Array, permitted: Array, getInherited: function }} - permission IDs.
     */
    static get(permissions) {
        const accessControl = new UserAccessControl(permissions);
        return {
            disabled: accessControl.#getDisabled(),
            permitted: accessControl.#getPermitted(),
            getInherited: (permissions)=> {
                return accessControl.#getInherited(permissions);
            }
        }
    }

    #getDisabled() {
        return this.permssions
            .filter((u) => u?.disabled)
            .map((u) => u?._id);
    }

    #getPermitted() {
        return this.permssions
            .filter((u) => u?.checked)
            .map((u) => u?._id);
    }
    // In PBAC settings, some permissions in the inherited property must be chosen.
    #getInherited(parentPermissions) {
        const inheritedArray = this.permssions
            .filter((p) => parentPermissions.includes(p?._id) && p?.inherited)
            .flatMap((p) => p?.inherited);
        return new Set(inheritedArray).toArray();
    }
}


module.exports = {
    ConfigurationService
};