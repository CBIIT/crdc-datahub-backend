const ERROR = require('../constants/error-constants');

class AuthorizationService {

    constructor(configurationService) {
        this.configurationService = configurationService;
    }

    /**
     * Function to get a user's scopes and scope values for a given permission
     * @param user {{role: string, permissions: string[]}} - the current user
     * @param permission {string} - the name of the permission without scopes, please use a permissions constant
     * for this input
     * Example: "entity:action"
     * @returns {{scopes: string[], scopeValues: string[]}} an object containing the user's scopes and scope values for
     * the input permission. If the user does not have the permission or has no scopes for the permission, then the
     * default response is {scopes: ["none"], scopeValues: []}
     */
    async getPermissionScope(user, permission){
        let output = {
            scopes: ['none'],
            scopeValues: []
        }
        const userPermissions = user?.permissions;
        if (!userPermissions || !permission){
            return output;
        }
        // Loop through the user's permissions until one matching the input permission is found
        for (const userPermission of userPermissions){
            const permissionAndScope = parsePermissionString(userPermission);
            let scopes = permissionAndScope?.scopes;

            if (permissionAndScope?.permission === permission) {
                if (!!scopes && scopes.length > 0){
                    output.scopes = scopes;
                    output.scopeValues = permissionAndScope?.scopeValues || []
                    return output;
                }
                /*
                The below block of code is for backwards compatibility. I expect this will eventually be removed.
                If a permission is found but no scopes are specified then this will retrieve and use the default
                scopes from the PBAC configuration in MongoDB.
                */

                const userRole  = user?.role;
                const pbacDefaults = await this.configurationService.getPBACByRoles([userRole]);
                if (pbacDefaults && pbacDefaults.length > 0){
                    let rolePermissions = pbacDefaults[0]?.permissions;
                    if (rolePermissions?.length > 0){
                        rolePermissions = rolePermissions.filter((x) => x._id === permission);
                        if (rolePermissions?.length > 0){
                            output.scopes = rolePermissions[0].scopes || [];
                            output.scopeValues = rolePermissions[0].scopeValues || [];
                        }
                    }
                }
                return output;
                /*
                End of the backwards compatability block
                */
            }
        }
        return output;
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
        scopes = scopes.map((scope) => {return scope.toLocaleLowerCase()})
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
