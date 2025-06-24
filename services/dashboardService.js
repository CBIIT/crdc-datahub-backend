const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const ERROR = require("../constants/error-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const ROLES = USER_CONSTANTS.USER.ROLES;
class DashboardService {
    constructor(userService, awsService, configurationService, {sessionTimeout}, authorizationService) {
        this.userService = userService;
        this.awsService = awsService;
        this.sessionTimeout = sessionTimeout;
        this.configurationService = configurationService;
        this.authorizationService = authorizationService;
    }

    async getDashboardURL(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.ADMIN.VIEW_DASHBOARD);
        if (userScope.isNoneScope()) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }

        const aDashboardConf = await this.configurationService.findByType(params?.type);
        const dashboardID = aDashboardConf?.dashboardID;

        if (!dashboardID) {
            throw new Error(ERROR.NO_VALID_DASHBOARD_TYPE);
        }

        return {
            url: await this.awsService.getQuickInsightURL(dashboardID, this.sessionTimeout),
            expiresIn: this.sessionTimeout
        };
    }

    async _getUserScope(userInfo, permission) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, permission);
        const userScope = UserScope.create(validScopes);
        // valid scopes; none, all, role/role:RoleScope
        const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope() || userScope.isStudyScope() || userScope.isDCScope();
        if (!isValidUserScope) {
            console.warn(ERROR.INVALID_USER_SCOPE, permission);
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }
}

module.exports = {
    DashboardService
};