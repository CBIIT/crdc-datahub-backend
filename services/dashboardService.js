const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../constants/error-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
class DashboardService {
    constructor(userService, awsService, configurationService, {sessionTimeout}) {
        this.userService = userService;
        this.awsService = awsService;
        this.sessionTimeout = sessionTimeout;
        this.configurationService = configurationService;
    }

    async getDashboardURL(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN, ROLES.FEDERAL_MONITOR]);

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
}

module.exports = {
    DashboardService
};