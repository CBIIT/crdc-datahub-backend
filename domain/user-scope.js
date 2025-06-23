const SCOPES = require("../constants/permission-scope-constants");
class UserScope {
    _ALL_STUDIES = "All";
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

    getRoleScope() {
        return this.scopes?.find(scope =>
            scope?.scope === SCOPES.ROLE
        );
    }

    getStudyScope() {
        return this.scopes?.find(scope =>
            scope?.scope === SCOPES.STUDY
        );
    }

    getDataCommonsScope() {
        return this.scopes?.find(scope =>
            scope?.scope === SCOPES.DC
        );
    }

    isRoleScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.ROLE);
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

    isStudyScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.STUDY);
    }

    hasStudyValue(studyID) {
        return this.scopes?.some(scope => scope?.scope === SCOPES.STUDY && (scope?.scopeValues.includes(studyID) || scope?.scopeValues?.includes(this._ALL_STUDIES)));
    }

    isDCScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.DC);
    }

    hasDCValue(dataCommons) {
        return this.scopes?.some(scope => scope?.scope === SCOPES.DC && scope?.scopeValues.includes(dataCommons));
    }

}

module.exports = {
    UserScope
};