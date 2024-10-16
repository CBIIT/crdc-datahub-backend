const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");

class UserService {
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, tier) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.tier = tier;
    }

    async requestAccess(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([USER.ROLES.USER, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER]);

        if (!Object.values(USER.ROLES).includes(params.role)) {
            return new Error(replaceErrorString(ERROR.INVALID_REQUEST_ROLE, params?.role));
        }

        const [org, adminUsers, orgOwners] = await Promise.all([
            this.#getOrgByID(params?.organization),
            this.getAdmin(),
            this.getOrgOwner(params?.organization)
        ]);

        if (!org || !org.name) {
            return new Error(ERROR.ORGANIZATION_NOT_FOUND);
        }

        const CCs = orgOwners?.filter((u)=> u.email).map((u)=> u.email);
        const adminEmails = adminUsers?.filter((u)=> u.email).map((u)=> u.email);
        const userInfo = context?.userInfo;
        const res = await this.notificationsService.requestUserAccessNotification(adminEmails,
            CCs, {
                userName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
                accountType: userInfo?.IDP,
                email: userInfo?.email,
                role: params?.role,
                additionalInfo: params?.additionalInfo?.trim()
            }
            ,this.tier);

        if (res) {
            return ValidationHandler.success()
        }
        return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
    }

    async #getOrgByID(orgID) {
        return (await this.organizationCollection.find(orgID))?.pop();
    }

    async getAdmin() {
        let result = await this.userCollection.aggregate([{
            "$match": {
                role: USER.ROLES.ADMIN,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
        return result || [];
    }

    async getOrgOwner(orgID) {
        return await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.ORG_OWNER,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
    }
}

module.exports = {
    UserService
};