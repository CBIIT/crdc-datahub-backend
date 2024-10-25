const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");

class UserService {
    constructor(userCollection, logCollection, organizationCollection, organizationService, notificationsService, submissionsCollection, applicationCollection, officialEmail, tier) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.organizationService = organizationService;
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

        if (![USER.ROLES.SUBMITTER, USER.ROLES.ORG_OWNER].includes(params.role)) {
            return new Error(replaceErrorString(ERROR.INVALID_REQUEST_ROLE, params?.role));
        }

        const [org, adminUsers, orgOwners] = await Promise.all([
            this.#getOrgByName(params?.organization),
            this.getAdmin(),
            this.getOrgOwnerByName(params?.organization)
        ]);

        if (!org || !org.name) {
            await this.organizationService.createOrganization({name: params?.organization});
        }

        const CCs = orgOwners?.filter((u)=> u.email).map((u)=> u.email);
        const adminEmails = adminUsers?.filter((u)=> u.email).map((u)=> u.email);
        const userInfo = context?.userInfo;

        if (adminEmails.length === 0) {
            return ValidationHandler.handle(ERROR.NO_ADMIN_USER);
        }

        const res = await this.notificationsService.requestUserAccessNotification(adminEmails,
            CCs, {
                userName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
                accountType: userInfo?.IDP,
                email: userInfo?.email,
                role: params?.role,
                org: params?.organization,
                additionalInfo: params?.additionalInfo?.trim()
            }
            ,this.tier);

        if (res?.accepted?.length > 0) {
            return ValidationHandler.success()
        }
        return ValidationHandler.handle(ERROR.DELETE_NO_DATA_FILE_EXISTS);
    }

    async #getOrgByName(orgName) {
        const orgs = await this.organizationCollection.aggregate([{
            "$match": {
                name: orgName
            }
        }]);
        //  This is an invalid case for the user.
        if (orgs.length > 1) {
            throw new Error(replaceErrorString(ERROR.DUPLICATE_ORGANIZATION_NAME, orgName));
        }
        return (orgs)?.pop();
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

    async getOrgOwnerByName(orgName) {
        return await this.userCollection.aggregate([{
            "$match": {
                "organization.name": orgName,
                role: USER.ROLES.ORG_OWNER,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
    }
}

module.exports = {
    UserService
};