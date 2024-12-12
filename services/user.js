const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");

class UserService {
    constructor(userCollection, logCollection, organizationCollection, organizationService, notificationsService, submissionsCollection, applicationCollection, officialEmail, appUrl, tier, approvedStudiesService) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.organizationService = organizationService;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.appUrl = appUrl;
        this.tier = tier;
        this.approvedStudiesService = approvedStudiesService;
    }

    async requestAccess(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyRole([USER.ROLES.USER, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER]);

        if (![USER.ROLES.SUBMITTER, USER.ROLES.ORG_OWNER].includes(params.role)) {
            return new Error(replaceErrorString(ERROR.INVALID_REQUEST_ROLE, params?.role));
        }

        const approvedStudies = params?.studies?.length > 0 ?
            await this.approvedStudiesService.listApprovedStudies({_id: {$in: params?.studies}})
            : []
        if (approvedStudies.length === 0) {
            return new Error(ERROR.INVALID_APPROVED_STUDIES_ACCESS_REQUEST);
        }

        const adminUsers = await this.getAdmin();
        const adminEmails = adminUsers?.filter((u)=> u.email).map((u)=> u.email);
        const userInfo = context?.userInfo;

        if (adminEmails.length === 0) {
            return ValidationHandler.handle(ERROR.NO_ADMIN_USER);
        }

        const res = await this.notificationsService.requestUserAccessNotification(adminEmails,
            [], {
                userName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
                accountType: userInfo?.IDP,
                email: userInfo?.email,
                role: params?.role,
                studies: approvedStudies?.map((study)=> study?.studyName),
                additionalInfo: params?.additionalInfo?.trim()
            }
            ,this.tier);

        if (res?.accepted?.length > 0) {
            return ValidationHandler.success()
        }
        return ValidationHandler.handle(replaceErrorString(ERROR.FAILED_TO_NOTIFY_ACCESS_REQUEST, `userID:${context?.userInfo?._id}`));
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

    /**
     * Retrieves user documents from the userCollection by matching organization ID.
     * @param {String} orgID - a organization ID
     * @returns {Array} - An array of user documents.
     */
    async getOrgOwner(orgID) {
        return await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.ORG_OWNER,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
    }

    async getOrgOwner(orgID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.ORG_OWNER,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
        return result;
    }

    async getConcierge(orgID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.CURATOR
            }
        }]);
        return result;
    }

    /**
     * Retrieves user documents from the userCollection for a Federal Lead role.
     * @returns {Array} - An array of user documents.
     */
    async getFedLeads() {
        return await this.userCollection.aggregate([{
            "$match": {
                role: USER.ROLES.FEDERAL_LEAD,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
    }
}

module.exports = {
    UserService
};