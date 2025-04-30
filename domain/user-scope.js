const SCOPES = require("../constants/permission-scope-constants");
class UserScope {
    constructor(validScopes) {
        this.scopes = validScopes || [];
    }

    /**
     * create a UserScopePermission to verify the user-scope
     *
     * @param {Scopes} validScopes - The array of valid user scopes
     * @returns {UserScope} - return UserScope object.
     */

    static create(validScopes) {
        return new UserScope(validScopes);
    }

    isPermittedRole(targetRoleValue) {
        return this.scopes?.some(scope => scope?.scope === SCOPES.ROLE && scope?.scopeValues?.includes(targetRoleValue));
    }

    isPermittedStudy(targetStudyValue) {
        return this.scopes?.some(scope => scope?.scope === SCOPES.STUDY && scope?.scopeValues?.includes(targetStudyValue));
    }

    isPermittedDataCommons(targetDataCommon) {
        return this.scopes?.some(scope => scope?.scope === SCOPES.DC && scope?.scopeValues?.includes(targetDataCommon));
    }

    isOwnScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.OWN);
    }

    isAllScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.ALL);
    }

    isNoneScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.NONE && scope?.scopeValues?.length === 0);
    }
}

module.exports = {
    UserScope
};