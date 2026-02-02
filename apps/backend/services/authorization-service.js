const ERROR = require('../constants/error-constants');
const SCOPES = require('../constants/permission-scope-constants');
const {
    SUBMISSION_REQUEST,
    DATA_SUBMISSION,
    ADMIN,
    EMAIL_NOTIFICATIONS: EN
} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");

class AuthorizationService {
    _allPermissionNamesSet = new Set([...Object.values(SUBMISSION_REQUEST), ...Object.values(DATA_SUBMISSION), ...Object.values(ADMIN)]);
    _DEFAULT_OUTPUT = {
        scope: SCOPES.NONE,
        scopeValues: []
    };
    _EVERY_SCOPE_VALUES = Object.values(SCOPES);
    constructor(configurationService) {
        this.configurationService = configurationService;
    }

    /**
     * Function to get a user's scopes and scope values for a given permission
     * @param user {{role: string, permissions: string[], studies: {_id: string[]}, dataCommons: string[]}} - the
     * current user
     * @param permission {string} - the name of the permission without scopes, please use a permissions constant
     * for this input
     * Example: "entity:action"
     * @returns Promise {{scope: string, scopeValues: string[]}[]} an array of objects containing a scope and the corresponding
     * scope values
     */
    async getPermissionScope(user, permission){
        const defaultOutput = [this._DEFAULT_OUTPUT];
        const userPermissions = user?.permissions;
        if (!userPermissions || !permission){
            return defaultOutput;
        }
        // Loop through the user's permissions until one matching the input permission is found
        for (const userPermission of userPermissions){
            const permissionAndScope = parsePermissionString(userPermission);
            if (permissionAndScope?.permission === permission) {
                return await this._getScopePermission(user, permissionAndScope, permission);
            }
        }
        return defaultOutput;
    }

    async _getScopePermission(user, permissionAndScope, permission) {
        let scopes = permissionAndScope?.scopes || [];
        let scopeValues = permissionAndScope?.scopeValues || [];
        if (scopes.length === 0){
            /*
            The below block of code is for backwards compatibility. I expect this will eventually be removed.
            If a permission is found but no scopes are specified then this will retrieve and use the default
            scopes from the PBAC configuration in MongoDB.
            */
            scopes = [SCOPES.NONE]
            const userRole = user?.role;
            const pbacDefaults = await this.configurationService.getPBACByRoles([userRole]);
            // if role has defaults
            if (pbacDefaults && pbacDefaults.length > 0) {
                let defaultRolePermissions = pbacDefaults[0]?.permissions;
                // if defaults contain permissions
                if (defaultRolePermissions?.length > 0) {
                    // loop through permissions defaults for the role
                    for (const permissionsObject of defaultRolePermissions){
                        let permissionParts = parsePermissionString(permissionsObject._id);
                        // if the permissionParts object matches the input permission
                        if (permissionParts.permission === permission){
                            scopes = permissionParts.scopes || [SCOPES.OWN];
                            scopeValues = permissionParts.scopeValues || [];
                            break;
                        }
                    }
                }
            }
            /*
            End of the backwards compatability block
            */
        }
        return this.formatScopesOutput(user, scopes, scopeValues);
    }

    /**
     * Takes a user, scopes array, and scope values array as input then formats them as an array of objects containing
     * a scope and the corresponding scope values. Study and DC scope values are pulled from the user object
     * @param user {{role: string, permissions: string[], studies: {_id: string[]}, dataCommons: string[]}} - the
     * current user
     * @param scopes {string[]}- an array of scopes
     * @param scopeValues {string[]}- an array of scope values
     * @returns {{scope: string, scopeValues: string[]}[]} an array of objects containing a scope and the corresponding
     * scope values
     */
    formatScopesOutput(user, scopes, scopeValues){
        let formattedOutput = [];
        if (scopes.includes(SCOPES.STUDY)){
            let userStudies = user?.studies || []
            userStudies = userStudies.map((study) => study?._id)
            formattedOutput.push({
                scope: SCOPES.STUDY,
                scopeValues: userStudies
            });
        }
        if (scopes.includes(SCOPES.DC)){
            let userDataCommons = user?.dataCommons || []
            formattedOutput.push({
                scope: SCOPES.DC,
                scopeValues: userDataCommons
            });
        }
        for (const scope of scopes){
            if (![SCOPES.STUDY, SCOPES.DC].includes(scope)){
                formattedOutput.push({
                    scope: scope,
                    scopeValues: scopeValues
                });
            }
        }
        return formattedOutput;
    }
    /**
     * Takes a user info, string permissions, return only valid permissions.
     * @param user {{role: string, permissions: string[], studies: {_id: string[]}, dataCommons: string[]}}
     * @param permissions {string[]}- an array of permissions
     * @returns {string[]} an array of valid permissions
     */
    async filterValidPermissions(user, permissions) {
        const filtered = [];
        for (const p of (permissions || [])) {
            if (!p) {
                continue;
            }
            const { permission, scopes: inputScope, scopeValues: inputScopeValues } = parsePermissionString(p);
            const outputScopes = await this._getScopePermission(user, {scopes: inputScope, scopeValues: inputScopeValues}, permission);
            const hasAnyScope = outputScopes?.some(scope => this._EVERY_SCOPE_VALUES.includes(scope.scope));
            if (this._allPermissionNamesSet.has(permission) && (hasAnyScope) && inputScope?.length > 0) {
                filtered.push(p);
            }
        }
        return filtered;
    }
}

/**
 * Function to extract the scopes and scope values from a permission string and then returns an object containing
 * the new permission string along with an array of the scopes.
 * @param permissionString {string} - a permission string including entity, action, and scopes
 * example: "entity:action:scope1+scope2"
 * @returns {{permission: string, scopes: string[], scopeValues: string[]}|null} - an object containing the permission
 * string without scopes and an array containing the scopes
 */
function parsePermissionString(permissionString){
    if (!permissionString || typeof permissionString !== "string"){
        throw new Error(ERROR.INVALID_PERMISSION_STRING);
    }
    const permissionStringElements = permissionString.split(':');
    if (!permissionStringElements || permissionStringElements?.length < 2) {
        return null;
    }
    let permission = [permissionStringElements[0],permissionStringElements[1]].join(":");
    let scopes = [];
    let scopeValues = [];
    // Scopes are case insensitive and will be converted to lowercase
    if (permissionStringElements.length > 2){
        scopes = permissionStringElements[2].split('+');
    }
    // Scope values are case sensitive and will not be modified
    if (permissionStringElements.length > 3){
        scopeValues = permissionStringElements[3].split('+');
    }
    return {
        permission,
        scopes,
        scopeValues
    };
}

module.exports = {
    AuthorizationService
};
