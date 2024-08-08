const {verifySession} = require("../verifier/user-info-verifier");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
class DashboardService {
    constructor(userService, awsService, {dashboardUserID, dashboardID, sessionTimeout}) {
        this.userService = userService;
        this.awsService = awsService;
        this.dashboardUserID = dashboardUserID;
        this.dashboardID = dashboardID;
        this.sessionTimeout = sessionTimeout;
    }

    async getDashboardURL(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([ROLES.FEDERAL_LEAD, ROLES.CURATOR, ROLES.ADMIN]);
        return {
            url: await this.awsService.getQuickInsightURL(this.dashboardUserID, this.dashboardID, this.sessionTimeout),
            expiresIn: this.sessionTimeout
        };
    }
}

module.exports = {
    DashboardService
};