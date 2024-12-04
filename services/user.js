const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const SUBMODULE_ERROR = require("../crdc-datahub-database-drivers/constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {UpdateProfileEvent, ReactivateUserEvent} = require("../crdc-datahub-database-drivers/domain/log-events");


const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(ERROR.NOT_LOGGED_IN);
}

class UserService {
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, appUrl, tier, approvedStudiesService, approvedStudiesCollection) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.appUrl = appUrl;
        this.tier = tier;
        this.approvedStudiesService = approvedStudiesService;
        this.approvedStudiesCollection = approvedStudiesCollection;
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

        const [adminUsers, orgOwners] = await Promise.all([
            this.getAdmin(),
            this.getOrgOwner(context?.userInfo?.organization?.orgID)
        ]);

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

    async editUser(params, context) {
        isLoggedInOrThrow(context);
        if (![USER.ROLES.ADMIN].includes(context?.userInfo?.role)) {
            throw new Error(SUBMODULE_ERROR.INVALID_ROLE);
        }
        if (!params.userID) {
            throw new Error(SUBMODULE_ERROR.INVALID_USERID);
        }

        const user = await this.userCollection.aggregate([{ "$match": { _id: params.userID } }]);
        if (!user || !Array.isArray(user) || user.length < 1 || user[0]?._id !== params.userID) {
            throw new Error(SUBMODULE_ERROR.USER_NOT_FOUND);
        }
        const updatedUser = {};
        const isCurator = updatedUser?.role === USER.ROLES.CURATOR || user[0]?.role === USER.ROLES.CURATOR || params?.role === USER.ROLES.CURATOR;

        if (params.role && Object.values(USER.ROLES).includes(params.role)) {
            updatedUser.role = params.role;
        }

        const isValidUserStatus = Object.values(USER.STATUSES).includes(params.status);
        if (params.status) {
            if (isValidUserStatus) {
                updatedUser.userStatus = params.status;
            } else {
                throw new Error(SUBMODULE_ERROR.INVALID_USER_STATUS);
            }
        }

        if (isCurator) {
            updatedUser.organization = null;
        }

        updatedUser.dataCommons = DataCommon.get(user[0]?.role, user[0]?.dataCommons, params?.role, params?.dataCommons);
        // Check if an organization is required and missing for the user's role
        const userHasOrg = Boolean(user[0]?.organization?.orgID);
        if (!userHasOrg && [USER.ROLES.DC_POC, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER, USER.ROLES.FEDERAL_MONITOR].includes(updatedUser.role || user[0]?.role)) {
            throw new Error(SUBMODULE_ERROR.USER_ORG_REQUIRED);
        }
        return await this.updateUserInfo(user[0], updatedUser, params.userID, params.status, params.role, params?.studies);
    }

    async updateUserInfo(prevUser, updatedUser, userID, status, role, approvedStudyIDs) {
        // add studies to user.
        const validStudies = await this.#findApprovedStudies(approvedStudyIDs);
        if (validStudies?.length !== approvedStudyIDs?.length) {
            throw new Error(SUBMODULE_ERROR.INVALID_NOT_APPROVED_STUDIES);
        }

        if (validStudies && approvedStudyIDs) {
            updatedUser.studies = approvedStudyIDs;
        }

        const res = await this.userCollection.findOneAndUpdate({ _id: userID }, {...updatedUser, updateAt: getCurrentTime()}, {returnDocument: 'after'});
        const userAfterUpdate = res.value;
        if (userAfterUpdate) {
            const promiseArray = [
                await this.#notifyDeactivatedUser(prevUser, status),
                await this.#notifyUpdatedUser(prevUser, userAfterUpdate, role),
                await this.#logAfterUserEdit(prevUser, userAfterUpdate)
            ];
            await Promise.all(promiseArray);
        } else {
            throw new Error(ERROR.UPDATE_FAILED);
        }

        if (userAfterUpdate.studies) {
            userAfterUpdate.studies = validStudies; // return approved studies dynamically with all properties of studies
        }
        return { ...prevUser, ...userAfterUpdate};
    }

    async #notifyDeactivatedUser(prevUser, newStatus) {
        const isUserActivated = prevUser?.userStatus !== USER.STATUSES.INACTIVE;
        const isStatusChange = newStatus && newStatus?.toLowerCase() === USER.STATUSES.INACTIVE.toLowerCase();
        if (isUserActivated && isStatusChange) {
            const adminEmails = await this.getAdminUserEmails();
            const CCs = adminEmails.filter((u)=> u.email).map((u)=> u.email);
            await this.notificationsService.deactivateUserNotification(prevUser.email,
                CCs, {firstName: prevUser.firstName},
                {officialEmail: this.officialEmail}
                ,this.tier);
        }
    }


    async #notifyUpdatedUser(prevUser, newUser, newRole) {
        const baseRoleCondition = newRole && Object.values(USER.ROLES).includes(newRole);
        const isRoleChange = baseRoleCondition && prevUser.role !== newUser.role;
        const isOrgChange = Boolean(prevUser?.organization?.orgID) && prevUser?.organization?.orgID !== newUser?.organization?.orgID;
        const isDataCommonsChange = newUser?.dataCommons?.length > 0 && JSON.stringify(prevUser?.dataCommons) !== JSON.stringify(newUser?.dataCommons);
        const isStudiesChange = JSON.stringify(prevUser.studies) !== JSON.stringify(newUser.studies);
        if (isRoleChange || isOrgChange || isDataCommonsChange || isStudiesChange) {
            const isSubmitterOrOrgOwner = [USER.ROLES.SUBMITTER, USER.ROLES.ORG_OWNER].includes(newUser.role);
            const CCs = isSubmitterOrOrgOwner ? (
                    await this.getOrgOwnerByOrgID(newUser.organization?.orgID))
                    ?.map((owner) => owner.email)
                : [];
            const orgName = isSubmitterOrOrgOwner ? newUser.organization?.orgName : undefined;
            const userDataCommons = [USER.ROLES.DC_POC, USER.ROLES.CURATOR].includes(newUser.role) ? newUser.dataCommons : undefined;
            const studyNames = await this.#findStudiesNames(newUser.studies);
            await this.notificationsService.userRoleChangeNotification(newUser.email,
                CCs, {
                    accountType: newUser.IDP,
                    email: newUser.email,
                    role: newUser.role,
                    org: orgName,
                    dataCommons: userDataCommons,
                    studies: studyNames?.length > 0 ? studyNames : "NA"
                },
                {url: this.appUrl, helpDesk: this.officialEmail}
                ,this.tier);
        }
    }

    async #logAfterUserEdit(prevUser, updatedUser) {
        // create an array to store new events
        let logEvents = [];
        const prevProfile = {}, newProfile = {};
        Object.keys(updatedUser).forEach(key => {
            if (["_id", "updateAt"].includes(key)) {
                return;
            }
            prevProfile[key] = prevUser?.[key];
            newProfile[key] = updatedUser[key];
        });
        // create a profile update event and store it in the events array
        const updateProfileEvent = UpdateProfileEvent.create(prevUser._id, prevUser.email, prevUser.IDP, prevProfile, newProfile);
        logEvents.push(updateProfileEvent);
        // if the user has been reactivated during the update
        if (prevProfile?.userStatus === USER.STATUSES.INACTIVE && newProfile?.userStatus === USER.STATUSES.ACTIVE){
            // create Reactivate User event and add it to the events array
            const reactivateUserEvent = ReactivateUserEvent.create(prevUser._id, prevUser.email, prevUser.IDP);
            logEvents.push(reactivateUserEvent);
        }
        // insert all of the events in the events array into the log collection
        const res = await this.logCollection.insertMany(logEvents);
        if (!res?.insertedCount || res?.insertedCount < 1) {
            console.error(`Failed to insert UpdateProfileEvent &&  ReactivateUserEvent: userID: ${updatedUser._id}`)
        }
    }

    async #findStudiesNames(studies) {
        if (!studies) return [];
        const studiesIDs = (studies[0] instanceof Object) ? studies.map((study) => study?._id) : studies;
        const approvedStudies = await this.approvedStudiesCollection.aggregate([{
            "$match": {
                "_id": { "$in": studiesIDs }
            }
        }]);
        return approvedStudies
            .map((study) => study.studyName);
    }

    /**
     * getOrgOwnerByOrgName
     * @param {*} orgID
     * @returns {Promise<Array>} user[]
     */
    async getOrgOwnerByOrgID(orgID) {
        const orgOwner= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.ORG_OWNER,
            "organization.orgID": orgID
        };
        return await this.userCollection.aggregate([{"$match": orgOwner}]);
    }

    async getAdminUserEmails() {
        const orgOwnerOrAdminRole = {
            "userStatus": USER.STATUSES.ACTIVE,
            "$or": [{"role": USER.ROLES.ADMIN}, {"role": USER.ROLES.ORG_OWNER}]
        };
        return await this.userCollection.aggregate([{"$match": orgOwnerOrAdminRole}]) || [];
    }

    async #findApprovedStudies(studies) {
        if (!studies || studies.length === 0) return [];
        const studiesIDs = (studies[0] instanceof Object) ? studies.map((study) => study?._id) : studies;
        const approvedStudies = await this.approvedStudiesCollection.aggregate([{
            "$match": {
                "_id": { "$in": studiesIDs }
            }
        }]);
        return approvedStudies;
    }
}


class DataCommon {

    constructor(currentRole, currentDataCommons, newRole, newDataCommons) {
        this.currentRole = currentRole;
        this.currentDataCommons = currentDataCommons;
        this.newRole = newRole;
        this.newDataCommons = newDataCommons;
    }

    /**
     * Get the new data commons based on the user's role & data commons.
     *
     * @param {string} currentRole - The user's current role.
     * @param {Array} currentDataCommons - The current data commons in the user collection.
     * @param {string} newRole - The user's new role.
     * @param {Array} newDataCommons - The new data commons to update the user.
     * @returns {Array} - return a data commons array.
     */
    static get(currentRole, currentDataCommons, newRole, newDataCommons) {
        const dataCommons = new DataCommon(currentRole, currentDataCommons, newRole, newDataCommons);
        return dataCommons.#getDataCommons();
    }

    #getDataCommons() {
        this.#validate(this.currentRole, this.currentDataCommons, this.newRole, this.newDataCommons);
        const isValidRole = this.#isDcPOC(this.currentRole, this.newRole) || this.#isCurator(this.currentRole, this.newRole);
        if (isValidRole) {
            return this.newDataCommons === undefined ? this.currentDataCommons : this.newDataCommons;
        }

        if (!isValidRole && this.currentDataCommons?.length > 0) {
            return [];
        }
        return [];
    }

    #isDcPOC(currentRole, newRole) {
        return newRole === USER.ROLES.DC_POC || (!newRole && currentRole === USER.ROLES.DC_POC);
    }

    #isCurator(currentRole, newRole) {
        return newRole === USER.ROLES.CURATOR || (!newRole && currentRole === USER.ROLES.CURATOR);
    }

    #validate(currentRole, currentDataCommons, newRole, newDataCommons) {
        const isValidRole = this.#isDcPOC(currentRole, newRole) || this.#isCurator(currentRole, newRole);
        if (isValidRole && newDataCommons?.length === 0) {
            throw new Error(SUBMODULE_ERROR.USER_DC_REQUIRED);
        }

        // Check if Data Commons is required and missing for the user's role
        const isValidDataCommons = newDataCommons?.length > 0 || (currentDataCommons?.length > 0 && newDataCommons === undefined);
        if (isValidRole && !isValidDataCommons) {
            throw new Error(SUBMODULE_ERROR.USER_DC_REQUIRED);
        }
    }
}

module.exports = {
    UserService
};