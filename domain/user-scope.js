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
        return this.scopes?.some(scope => scope?.scope === SCOPES.ROLE || scope === SCOPES.ROLE);
    }

    isOwnScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.OWN || scope === SCOPES.OWN);
    }

    isAllScope() {
        return this.scopes?.some(scope => scope?.scope === SCOPES.ALL || scope === SCOPES.ALL);
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
    /**
    * @param {string} studyID - studyID to check access for.
    * @returns {boolean} True if the user has access to the specific study, false otherwise.
     * */
    hasStudyScopeByID(studyID) {
        if (!this.isStudyScope()) {
            return false;
        }
        const studyScope = this.getStudyScope();
        const scopeValues = studyScope?.scopeValues || [];
        return (Boolean(studyID) && scopeValues.includes(studyID));
    }
    /**
     * @returns {boolean} True if the user has access to all studies, false otherwise.
     * */
    hasAllStudyScope() {
        if (!this.isStudyScope()) {
            return false;
        }
        const studyScope = this.getStudyScope();
        const scopeValues = studyScope?.scopeValues || [];
        return scopeValues.includes(this._ALL_STUDIES);
    }


}

module.exports = {
    UserScope
};