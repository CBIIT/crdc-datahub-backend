const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
class DashboardService {
    constructor(userService, awsService, configurationService, {dashboardUserID, sessionTimeout}) {
        this.userService = userService;
        this.awsService = awsService;
        this.dashboardUserID = dashboardUserID;
        this.sessionTimeout = sessionTimeout;
        this.configurationService = configurationService;
    }

    async getDashboardURL(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN]);

        const aDashboardConf = await this.configurationService.findByType(params?.type);
        const dashboardID = aDashboardConf?.dashboardID;

        if (!dashboardID) {
            throw new Error(ERROR.NO_VALID_DASHBOARD_TYPE);
        }

        return {
            url: await this.awsService.getQuickInsightURL(this.dashboardUserID, dashboardID, this.sessionTimeout),
            expiresIn: this.sessionTimeout
        };
    }
}

module.exports = {
    DashboardService
};