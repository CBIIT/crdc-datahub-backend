const {verifySession} = require("../verifier/user-info-verifier");
const ConfigurationDAO = require("../dao/configuration");
const PBAC_CONFIG_TYPE = "PBAC";
const CLI_UPLOADER_VERSION = "CLI_UPLOADER_VERSION";
const APPLICATION_FORM_VERSIONS = "APPLICATION_FORM_VERSIONS";
const MAINTENANCE_MODE = "MAINTENANCE_MODE";
const getOMBConfiguration = require("../dao/omb");
const ERROR = require("../constants/error-constants");
class ConfigurationService {
    constructor() {
        this.configurationDAO = new ConfigurationDAO();
    }
    async findByType(type) {
        return await this.configurationDAO.findByType(type) || null;
    }

    async isMaintenanceMode() {
        const result = await this.configurationDAO.findByType(MAINTENANCE_MODE);
        return (result) ? (result?.keys?.flag || false) : false;
    }

    async findManyByType(type) {
         return await this.configurationDAO.findManyByType(type) || [];
    }

    /**
     * API: getPBTCDDefaults retrieve roles default permissions and notifications.
     * @param {*} params 
     * @param {*} context 
     */
    async getPBACDefaults(params, context){
        verifySession(context)
            .verifyInitialized();

        const userInfo = context.userInfo;
        console.log(`getPBACDefaults called by user: ${userInfo._id}`);

        return await this.getPBACByRoles(params.roles);
    }
    /**
     * Get PBAC defaults by roles
     * @param {Array} roles
     * @returns {Object} PBAC defaults
     */
    async getPBACByRoles(roles){
       let result = await this.configurationDAO.findByType(PBAC_CONFIG_TYPE);
        if (!result || !result?.Defaults || result?.Defaults.length === 0){
            return null;
        }
        let pbacArray = result.Defaults.map(role => {
            const permissions = role.permissions.map(permission => ({...permission, _id: permission.id}));
            const notifications = (role.notifications || []).map(n => ({...n, _id: n.id}));
            return {...role, permissions: permissions, notifications: notifications}
        });
        result = {Defaults:pbacArray};
        return (roles.includes("All"))? result.Defaults : result.Defaults.filter((item)=> roles.includes(item.role));
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

    /**
     * API: getOMB retrieve OMB message
     */
    async getOMB() {
        // get OMB info from database
        const ombConfig = await getOMBConfiguration();
        if (!ombConfig) {
            throw new Error(ERROR.OMB_NOT_FOUND);
        }
        return ombConfig;
    }

    /**
     * API: retrieveApplicationFormVersion
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async getApplicationFormVersion(params, context) {
        const applicationFormVersion = await this.configurationDAO.findByType(APPLICATION_FORM_VERSIONS);
        if (!applicationFormVersion) {
            throw new Error(ERROR.APPLICATION_FORM_VERSIONS_NOT_FOUND);
        }
        return {...applicationFormVersion, _id: applicationFormVersion.id}
    }

    /**
     * public API: retrieveCLIUploaderVersion
     * @param {*} params 
     * @param {*} context 
     * @returns 
     */
    async retrieveCLIUploaderVersion(params, context) {
        return await this.getCurrentCLIUploaderVersion();
    }

    async getCurrentCLIUploaderVersion() {
        const result = await this.configurationDAO.findByType(CLI_UPLOADER_VERSION);
        return (result) ? result?.current_version : null;
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
            disabled: accessControl._getDisabled(),
            permitted: accessControl._getPermitted(),
            getInherited: (permissions)=> {
                return accessControl._getInherited(permissions);
            }
        }
    }

    _getDisabled() {
        return this.permssions
            .filter((u) => u?.disabled)
            .map((u) => u?._id);
    }

    _getPermitted() {
        return this.permssions
            .filter((u) => u?.checked)
            .map((u) => u?._id);
    }
    // In PBAC settings, some permissions in the inherited property must be chosen.
    _getInherited(parentPermissions) {
        const inheritedArray = this.permssions
            .filter((p) => parentPermissions.includes(p?._id) && p?.inherited)
            .flatMap((p) => p?.inherited);
        return new Set(inheritedArray).toArray();
    }
}


module.exports = {
    ConfigurationService
};