const jwt = require("jsonwebtoken");
const {ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");
const config = require("../config");
const {getCurrentTime, subtractDaysFromNowTimestamp} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {UpdateProfileEvent, ReactivateUserEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {includesAll} = require("../crdc-datahub-database-drivers/utility/string-utility");
const {isUndefined} = require("../utility/string-util");
const {LOG_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const orgToUserOrg = require("../crdc-datahub-database-drivers/utility/org-to-userOrg-converter");


const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(ERROR.NOT_LOGGED_IN);
}

const isValidUserStatus = (userStatus) => {
    const validUserStatus = [USER.STATUSES.ACTIVE];
    if (userStatus && !validUserStatus.includes(userStatus)) throw new Error(ERROR.INVALID_USER_STATUS);
}

const createToken = (userInfo, token_secret, token_timeout)=> {
    return jwt.sign(
        userInfo,
        token_secret,
        { expiresIn: token_timeout });
}



class User {
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

    async grantToken(params, context){
        isLoggedInOrThrow(context);
        isValidUserStatus(context?.userInfo?.userStatus);
        if(context?.userInfo?.tokens){
            context.userInfo.tokens = []
        }
        const accessToken = createToken(context?.userInfo, config.token_secret, config.token_timeout);
        await this.linkTokentoUser(context, accessToken);
        return {
            tokens: [accessToken],
            message: "This token can only be viewed once and will be lost if it is not saved by the user"
        }
    }

    async linkTokentoUser(context, accessToken){
        const sessionCurrentTime = getCurrentTime();
        const updateUser ={
            _id: context.userInfo._id,
            tokens: [accessToken],
            updateAt: sessionCurrentTime
        }
        const updateResult = await this.userCollection.update(updateUser);

        if (!updateResult?.matchedCount === 1) {
            throw new Error(ERROR.UPDATE_FAILED);
        }

        context.userInfo = {
            ...context.userInfo,
            ...updateUser
        }
    }


    async getUserByID(userID) {
        const result = await this.userCollection.aggregate([{
            "$match": {
                _id: userID
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }

    /**
     * Retrieves user documents from the userCollection by matching multiple organization IDs.
     * @param {Array} organizationIDs - An array of organization IDs
     * @returns {Array} - An array of user documents.
     */
    async getUsersByOrganizationIDs(organizationIDs) {
        const result = await this.userCollection.aggregate([{
            "$match": {
                userStatus: USER.STATUSES.ACTIVE,
                "organization.orgID": { "$in": organizationIDs } // userIDs should be an array of IDs
            }
        }]);
        return (result?.length > 0) ? result : [];
    }


    async getUser(params, context) {
        isLoggedInOrThrow(context);
        if (!params?.userID) {
            throw new Error(ERROR.INVALID_USERID);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(ERROR.NO_ORG_ASSIGNED);
        }
        const filters = { _id: params.userID };
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

        const result = await this.userCollection.aggregate([{
            "$match": filters
        }, {"$limit": 1}]);

        return (result?.length === 1) ? result[0] : null;
    }


    async listUsers(params, context) {
        isLoggedInOrThrow(context);
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo?.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(ERROR.NO_ORG_ASSIGNED);
        }

        const filters = {};
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

        const result = await this.userCollection.aggregate([{
            "$match": filters
        }]);

        return result || [];
    }

    /**
     * List Active Curators API Interface.
     *
     * - `ADMIN` can call this API only
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context API request context
     * @returns {Promise<Object[]>} An array of Curator Users mapped to the `UserInfo` type
     */
    async listActiveCuratorsAPI(params, context) {
        if (!context?.userInfo?.email || !context?.userInfo?.IDP) {
            throw new Error(ERROR.NOT_LOGGED_IN);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN) {
            throw new Error(ERROR.INVALID_ROLE);
        }

        const curators = await this.getActiveCurators();
        return curators?.map((user) => ({
            userID: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt,
            updateAt: user.updateAt,
        })) || [];
    }

    /**
     * Get all users with the `CURATOR` role and `ACTIVE` status.
     *
     * @async
     * @returns {Promise<Object[]>} An array of Users
     */
    async getActiveCurators() {
        const filters = { role: USER.ROLES.CURATOR, userStatus: USER.STATUSES.ACTIVE };
        const result = await this.userCollection.aggregate([{ "$match": filters }]);

        return result || [];
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
     * Retrieves user documents from the userCollection by matching multiple data commons.
     * @param {Array} dataCommons - An array of data commons IDs
     * @returns {Array} - An array of user documents.
     */
    async getPOCs(dataCommons) {
        const result = await this.userCollection.aggregate([{
            "$match": {
                role: USER.ROLES.DC_POC,
                userStatus: USER.STATUSES.ACTIVE,
                "dataCommons": {$in: Array.isArray(dataCommons) ? dataCommons : [dataCommons]}
            }
        }]);
        return result || [];
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

    async updateMyUser(params, context) {
        isLoggedInOrThrow(context);
        isValidUserStatus(context?.userInfo?.userStatus);
        let sessionCurrentTime = getCurrentTime();
        let user = await this.userCollection.find(context.userInfo._id);
        if (!user || !Array.isArray(user) || user.length < 1) throw new Error("User is not in the database")

        if (!context.userInfo._id) {
            let error = "there is no UserId in the session";
            console.error(error)
            throw new Error(error)
        }
        const updateUser ={
            _id: context.userInfo._id,
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime
        }
        const updateResult = await this.userCollection.update(updateUser);
        // store user update log
        if (updateResult?.matchedCount > 0) {
            const prevUser = {firstName: user[0].firstName, lastName: user[0].lastName};
            const newProfile = {firstName: params.userInfo.firstName, lastName: params.userInfo.lastName};
            const log = UpdateProfileEvent.create(user[0]._id, user[0].email, user[0].IDP, prevUser, newProfile);
            await this.logCollection.insert(log);
        }
        // error handling
        if (updateResult.matchedCount < 1) {
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }

        // Update all dependent objects only if the User's Name has changed
        // NOTE: We're not waiting for these async updates to complete before returning the updated User
        if (updateUser.firstName !== user[0].firstName || updateUser.lastName !== user[0].lastName) {
            this.submissionsCollection.updateMany(
                { "submitterID": updateUser._id },
                { "submitterName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
            this.organizationCollection.updateMany(
                { "conciergeID": updateUser._id },
                { "conciergeName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
            this.applicationCollection.updateMany(
                { "applicant.applicantID": updateUser._id },
                { "applicant.applicantName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
        }

        context.userInfo = {
            ...context.userInfo,
            ...updateUser,
            updateAt: sessionCurrentTime
        }
        const result = {
            ...user[0],
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime
        }
        return result;
    }

    async editUser(params, context) {
        isLoggedInOrThrow(context);
        if (![USER.ROLES.ADMIN].includes(context?.userInfo?.role)) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (!params.userID) {
            throw new Error(ERROR.INVALID_USERID);
        }

        const sessionCurrentTime = getCurrentTime();
        const user = await this.userCollection.aggregate([{ "$match": { _id: params.userID } }]);
        if (!user || !Array.isArray(user) || user.length < 1 || user[0]?._id !== params.userID) {
            throw new Error(ERROR.USER_NOT_FOUND);
        }

        const updatedUser = { _id: params.userID, updateAt: sessionCurrentTime };
        const isCurator = updatedUser?.role === USER.ROLES.CURATOR || user[0]?.role === USER.ROLES.CURATOR || params?.role === USER.ROLES.CURATOR;
        if (typeof(params.organization) !== "undefined" && params.organization && params.organization !== user[0]?.organization?.orgID) {
            const result = await this.organizationCollection.aggregate([{
                "$match": { _id: params.organization }
            }, {"$limit": 1}]);
            const newOrg = result?.[0];

            if (!newOrg?._id || newOrg?._id !== params.organization) {
                throw new Error(ERROR.INVALID_ORG_ID);
            }

            updatedUser.organization = orgToUserOrg(newOrg);
        } else if ((typeof(params.organization) !== "undefined" && !params.organization && user[0]?.organization?.orgID) || isCurator) { // Data Curator should not be assigned any Org
            updatedUser.organization = null;
        }
        if (params.role && Object.values(USER.ROLES).includes(params.role)) {
            updatedUser.role = params.role;
        }
        if (params.status && Object.values(USER.STATUSES).includes(params.status)) {
            updatedUser.userStatus = params.status;
        }

        updatedUser.dataCommons = DataCommon.get(user[0]?.role, user[0]?.dataCommons, params?.role, params?.dataCommons);
        // add studies to user.
        let userOrg = updatedUser.organization;
        if (params.studies &&  params.studies.length > 0) {
            if (![USER.ROLES.FEDERAL_MONITOR].includes(updatedUser.role || user[0]?.role))
            {
                if (!userOrg || !userOrg.studies) {
                    const result = await this.organizationCollection.aggregate([{
                        "$match": { _id: params.organization }
                    }, {"$limit": 1}]);
                    if (!result?.[0]?._id) {
                        throw new Error(ERROR.INVALID_ORG_ID);
                    }
                    userOrg = result[0];
                }
                const approvedStudies = userOrg?.studies;
                if (!approvedStudies || approvedStudies.length === 0) {
                    throw new Error(ERROR.INVALID_NO_STUDIES);
                }
                const approvedStudyArr = approvedStudies.map((study) => study._id)
                if (!includesAll(approvedStudyArr, params.studies)) {
                    throw new Error(ERROR.INVALID_NOT_APPROVED_STUDIES);
                }
            }
            updatedUser.studies = params?.studies;
        }
        else
            updatedUser.studies = []
        if (params?.status){
            if (! [USER.STATUSES.ACTIVE, USER.STATUSES.INACTIVE].includes(params.status))
                throw new Error(ERROR.INVALID_USER_STATUS);

            updatedUser.status = params.status
        }

        // Check if an organization is required and missing for the user's role
        const userHasOrg = !!updatedUser?.organization?.orgID || (user[0]?.organization?.orgID && typeof(updatedUser.organization) === "undefined");
        if (!userHasOrg && [USER.ROLES.DC_POC, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER, USER.ROLES.FEDERAL_MONITOR].includes(updatedUser.role || user[0]?.role)) {
            throw new Error(ERROR.USER_ORG_REQUIRED);
        }

        const updateResult = await this.userCollection.update(updatedUser);
        if (updateResult?.matchedCount === 1) {
            const prevProfile = {}, newProfile = {};

            Object.keys(updatedUser).forEach(key => {
                if (["_id", "updateAt"].includes(key)) {
                    return;
                }

                prevProfile[key] = user[0]?.[key];
                newProfile[key] = updatedUser[key];
            });

            const aUser = user[0];
            const isUserActivated = aUser?.userStatus !== USER.STATUSES.INACTIVE;
            const isStatusChange = params.status && params.status.toLowerCase() === USER.STATUSES.INACTIVE.toLowerCase();
            if (isUserActivated && isStatusChange) {
                const adminEmails = await this.getAdminUserEmails();
                const CCs = adminEmails.filter((u)=> u.email).map((u)=> u.email);
                await this.notificationsService.deactivateUserNotification(aUser.email,
                    CCs, {firstName: aUser.firstName},
                    {officialEmail: this.officialEmail}
                    ,this.tier);
            }

            // create an array to store new events
            let logEvents = [];
            // create a profile update event and store it in the events array
            const updateProfileEvent = UpdateProfileEvent.create(user[0]._id, user[0].email, user[0].IDP, prevProfile, newProfile);
            logEvents.push(updateProfileEvent);
            // if the user has been reactivated during the update
            if (prevProfile?.userStatus === USER.STATUSES.INACTIVE && newProfile?.userStatus === USER.STATUSES.ACTIVE){
                // create Reactivate User event and add it to the events array
                const reactivateUserEvent = ReactivateUserEvent.create(user[0]._id, user[0].email, user[0].IDP);
                logEvents.push(reactivateUserEvent);
            }
            // insert all of the events in the events array into the log collection
            await this.logCollection.insertMany(logEvents);
        } else {
            throw new Error(ERROR.UPDATE_FAILED);
        }

        return { ...user[0], ...updatedUser };
    }

    async getAdminUserEmails() {
        const orgOwnerOrAdminRole = {
            "userStatus": USER.STATUSES.ACTIVE,
            "$or": [{"role": USER.ROLES.ADMIN}, {"role": USER.ROLES.ORG_OWNER}]
        };
        return await this.userCollection.aggregate([{"$match": orgOwnerOrAdminRole}]) || [];
    }

    /**
     * Disable users matching specific user conditions.
     *
     * @param {Array} inactiveUsers - An array of user conditions for $or.
     * @returns {Promise<Array>} - An array of user aggregation result.
     */
    // search by user's email and idp
    async disableInactiveUsers(inactiveUsers) {
        if (!inactiveUsers || inactiveUsers?.length === 0) return [];
        const query = {"$or": inactiveUsers};
        const updated = await this.userCollection.updateMany(query, {userStatus: USER.STATUSES.INACTIVE});
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            return await this.userCollection.aggregate([{"$match": query}]) || [];
        }
        return [];
    }

    /**
     * getOrgOwnerByOrgName
     * @param {*} orgName
     * @returns {Promise<Array>} user[]
     */
    async getOrgOwnerByOrgName(orgName) {
        const orgOwner= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.ORG_OWNER,
            "organization.orgName": orgName
        };
        return await this.userCollection.aggregate([{"$match": orgOwner}]);
    }

    /**
     * getFederalMonitors
     * @param {*} studyID
     * @returns {Promise<Array>} user[]
     */
    async getFederalMonitors(studyID) {
        const query= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.FEDERAL_MONITOR,
            "studies": {$in: [studyID]}
        };
        return await this.userCollection.aggregate([{"$match": query}]);
    }

    /**
     * getCurators
     * @param {*} dataCommons
     * @returns {Promise<Array>} user[]
     */
    async getCurators(dataCommons) {
        const query= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.CURATOR,
            "dataCommons": {$in: Array.isArray(dataCommons) ? dataCommons : [dataCommons]}
        };
        return await this.userCollection.aggregate([{"$match": query}]);
    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }

    async checkForInactiveUsers(qualifyingEvents) {
        // users collection field names
        const USER_FIELDS = {
            ID: "_id",
            FIRST_NAME: "firstName",
            EMAIL: "email",
            IDP: "IDP",
            STATUS: "userStatus"
        };
        // logs collection field names
        const LOGS_FIELDS = {
            EMAIL: "userEmail",
            IDP: "userIDP",
            EVENT_TYPE: "eventType",
            TIMESTAMP: "timestamp"
        };
        // fields added by pipeline
        const LOGS_ARRAY = "log_events_array";
        const LATEST_LOG = "latest_log_event";

        let pipeline = [];
        // filter out users where status is not "Active"
        pipeline.push({
            $match: {
                [USER_FIELDS.STATUS]: USER.STATUSES.ACTIVE
            }
        });
        // collect log events where the log event email matches the user's email and store the events in an array
        // NOTE: we can only match on one field here so log events where the IDP does not match will be filtered out in
        // the next stage
        pipeline.push({
            $lookup: {
                from: LOG_COLLECTION,
                localField: USER_FIELDS.EMAIL,
                foreignField: LOGS_FIELDS.EMAIL,
                as: LOGS_ARRAY
            }
        });
        // filter out the log events where the IDP does not match the user's IDP and the log events where the event type
        // is not included in the qualifying events array
        pipeline.push({
            $set: {
                [LOGS_ARRAY]: {
                    $filter: {
                        input: "$" + LOGS_ARRAY,
                        as: "log",
                        cond: {
                            $and: [
                                {
                                    $eq: ["$$log." + LOGS_FIELDS.IDP, "$" + USER_FIELDS.IDP],
                                },
                                {
                                    $in: ["$$log." + LOGS_FIELDS.EVENT_TYPE, qualifyingEvents]
                                },
                            ],
                        }
                    }
                }
            }
        });
        // store the most recent log event in a new field
        pipeline.push({
            $set: {
                [LATEST_LOG]: {
                    $first: {
                        $sortArray: {
                            input: "$" + LOGS_ARRAY,
                            sortBy: {
                                timestamp: -1
                            }
                        }
                    }
                }
            }
        });
        // filter out users that have qualifying log event types recent enough to fall within the inactive user days period
        pipeline.push({
            $match: {
                $or: [
                    {
                        [LATEST_LOG+"."+LOGS_FIELDS.TIMESTAMP]: {
                            $exists: 0
                        }
                    },
                    {
                        [LATEST_LOG+"."+LOGS_FIELDS.TIMESTAMP]: {
                            $lt: subtractDaysFromNowTimestamp(config.inactive_user_days)
                        }
                    },
                ]
            }
        });
        // format the output
        pipeline.push({
            $project: {
                [USER_FIELDS.ID]: 1,
                [USER_FIELDS.EMAIL]: 1,
                [USER_FIELDS.IDP]: 1,
                [USER_FIELDS.FIRST_NAME]: 1,
            }
        });
        return await this.userCollection.aggregate(pipeline);
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
            return isUndefined(this.newDataCommons) ? this.currentDataCommons : this.newDataCommons;
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
            throw new Error(ERROR.USER_DC_REQUIRED);
        }

        // Check if Data Commons is required and missing for the user's role
        const isValidDataCommons = newDataCommons?.length > 0 || (currentDataCommons?.length > 0 && isUndefined(newDataCommons));
        if (isValidRole && !isValidDataCommons) {
            throw new Error(ERROR.USER_DC_REQUIRED);
        }
    }
}


module.exports = {
    User
}
