const ERROR = require('../constants/error-constants');

class AuthorizationService {

    constructor(configurationService) {
        this.configurationService = configurationService;
    }

    /**
     * Function to get a user's scopes for a given permission
     * @param user - the current user
     * @param permission - the name of the permission without scopes, please use a permissions constant for this input
     * Example: "entity:action"
     * @returns {*|string[]|*[]} - an array containing the scopes for the permission or an empty array, all scopes will be lowercase
     */
    async getPermissionScope(user, permission){
        const userPermissions = user?.permissions;
        if (!userPermissions || !permission){
            return [];
        }
        // Loop through the user's permissions until one matching the input permission is found
        for (const userPermission of userPermissions){
            const permissionAndScope = parsePermissionString(userPermission);
            let scopes = permissionAndScope?.scopes;
            if (permissionAndScope?.permission === permission) {
                if (!!scopes && scopes.length > 0){
                    return scopes;
                }
                /*
                The below block of code is for backwards compatibility. I expect this will eventually be removed.
                If a permission is found but no scopes are specified then this will retrieve and use the default
                scopes from the PBAC configuration in MongoDB.
                */
                scopes = [];
                const userRole  = user?.role;
                const pbacDefaults = await this.configurationService.getPBACByRoles([userRole]);
                if (pbacDefaults && pbacDefaults.length > 0){
                    let rolePermissions = pbacDefaults[0]?.permissions;
                    if (rolePermissions?.length > 0){
                        rolePermissions = rolePermissions.filter((x) => x._id === permission);
                        if (rolePermissions?.length > 0){
                            scopes = rolePermissions[0].scopes || [];
                        }
                    }
                }
                return scopes;
                /*
                End of the backwards compatability block
                */
            }
        }
        return [];
    }
}

/**
 * Function to extract the scopes from a permission string and then returns an object containing the new permission
 * string along with an array of the scopes.
 * @param permissionString - a permission string including entity, action, and scopes
 * example: "entity:action:scope1+scope2"
 * @returns {{permission: string, scopes: string[]}|null} - an object containing the permission string without scopes and
 * an array containing the scopes
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
    if (permissionStringElements.length > 2){
        scopes = permissionStringElements[2].split('+');
        scopes = scopes.map((scope) => {return scope.toLocaleLowerCase()})
    }
    return {
        permission,
        scopes
    };
}

module.exports = {
    AuthorizationService
};
