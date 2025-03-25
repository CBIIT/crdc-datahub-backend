const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const {ERROR: SUBMODULE_ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const config = require("../config");
const {getCurrentTime, subtractDaysFromNowTimestamp} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {UpdateProfileEvent, ReactivateUserEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {LOG_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const jwt = require("jsonwebtoken");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const {
    SUBMISSION_REQUEST,
    ADMIN,
    DATA_SUBMISSION,
    EMAIL_NOTIFICATIONS: EN
} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");

const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(SUBMODULE_ERROR.NOT_LOGGED_IN);
}

const isValidUserStatus = (userStatus) => {
    const validUserStatus = [USER.STATUSES.ACTIVE];
    if (userStatus && !validUserStatus.includes(userStatus)) throw new Error(SUBMODULE_ERROR.INVALID_USER_STATUS);
}

const createToken = (userInfo, token_secret, token_timeout)=> {
    return jwt.sign(
        userInfo,
        token_secret,
        { expiresIn: token_timeout });
}


class UserService {
    #allPermissionNamesSet = new Set([...Object.values(SUBMISSION_REQUEST), ...Object.values(DATA_SUBMISSION), ...Object.values(ADMIN)]);
    #allEmailNotificationNamesSet = new Set([...Object.values(EN.SUBMISSION_REQUEST), ...Object.values(EN.DATA_SUBMISSION), ...Object.values(EN.USER_ACCOUNT)]);
    #NIH = "nih";
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, appUrl, approvedStudiesService, inactiveUserDays, configurationService) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.appUrl = appUrl;
        this.approvedStudiesService = approvedStudiesService;
        this.approvedStudiesCollection = approvedStudiesService.approvedStudiesCollection;
        this.inactiveUserDays = inactiveUserDays;
        this.configurationService = configurationService;
    }

    async requestAccess(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REQUEST_ACCESS);

        const approvedStudies = params?.studies?.length > 0 ?
            await this.approvedStudiesService.listApprovedStudies({_id: {$in: params?.studies}})
            : []
        if (approvedStudies.length === 0) {
            return new Error(ERROR.INVALID_APPROVED_STUDIES_ACCESS_REQUEST);
        }

        const adminUsers = await this.getUsersByNotifications([EN.USER_ACCOUNT.USER_REQUEST_ACCESS],
            [ROLES.ADMIN]);
        const adminEmails = adminUsers
            ?.filter((u)=> u?.email)
            .map((u)=> u?.email);
        const userInfo = context?.userInfo;

        if (adminEmails.length === 0) {
            console.error("The request access notification does not have any recipient");
            return ValidationHandler.handle(ERROR.NO_ADMIN_USER);
        }

        const res = await this.notificationsService.requestUserAccessNotification(adminEmails, {
                userName: `${userInfo.firstName} ${userInfo?.lastName || ''}`,
                accountType: userInfo?.IDP,
                email: userInfo?.email,
                role: params?.role,
                studies: approvedStudies?.map((study)=> study?.studyName),
                additionalInfo: params?.additionalInfo?.trim()
            });

        if (res?.accepted?.length > 0) {
            return ValidationHandler.success()
        }
        return ValidationHandler.handle(replaceErrorString(ERROR.FAILED_TO_NOTIFY_ACCESS_REQUEST, `userID:${context?.userInfo?._id}`));
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
            throw new Error(SUBMODULE_ERROR.UPDATE_FAILED);
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

        if (result?.length === 1) {
            const user = result[0];
            const studies = await this.#findApprovedStudies(user.studies);
            return {
                ...user,
                studies
            };
        } else {
            return null;
        }
    }

    async #findStudiesNames(studies) {
        if (!studies) return [];
        const studiesIDs = (studies[0] instanceof Object) ? studies.map((study) => study?._id) : studies;
        if(studiesIDs.includes("All"))
            return ["All studies"];
        const approvedStudies = await this.approvedStudiesCollection.aggregate([{
            "$match": {
                "_id": { "$in": studiesIDs }
            }
        }]);
        return approvedStudies
            .map((study) => study.studyName);
    }

    async #findApprovedStudies(studies) {
        if (!studies || studies.length === 0) return [];
        const studiesIDs = (studies[0] instanceof Object) ? studies.map((study) => study?._id) : studies;
        if(studiesIDs.includes("All"))
            return [{_id: "All", studyName: "All" }];
        const approvedStudies = await this.approvedStudiesCollection.aggregate([{
            "$match": {
                "_id": { "$in": studiesIDs }
            }
        }]);
        return approvedStudies;
    }

    async getUser(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_USER);
        
        if (!params?.userID) {
            throw new Error(SUBMODULE_ERROR.INVALID_USERID);
        }

        const filters = { _id: params.userID };
        const result = await this.userCollection.aggregate([{
            "$match": filters
        }, {"$limit": 1}]);
        if (result?.length === 1) {
            const user = result[0];
            const studies = await this.#findApprovedStudies(user?.studies);
            return {
                ...user,
                studies
            };
        } else {
            return null;
        }
    }

    async listUsers(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_USER);

        const result = await this.userCollection.aggregate([{
            "$match": {}
        },]);

        for (let user of result) {
            user.studies = await this.#findApprovedStudies(user?.studies);
        }
        return result || [];
    }

    /**
     * List Active Data-Commons Personnel API Interface.
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context API request context
     * @returns {Promise<User[]>} An array of Data-Commons Personnel Users
     */
    async listActiveDCPsAPI(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission([USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_STUDIES, USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_PROGRAMS]);
        const DCPUsers = await this.getDCPs(params.dataCommons || []);
        return DCPUsers?.map((user) => ({
            userID: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt,
            updateAt: user.updateAt,
        })) || [];
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
        const userStudies = await this.#findApprovedStudies(user[0]?.studies);
        const result = {
            ...user[0],
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime,
            studies: userStudies
        }
        return result;
    }

    async editUser(params, context) {
        verifySession(context)
            .verifyInitialized()
            .verifyPermission(USER_PERMISSION_CONSTANTS.ADMIN.MANAGE_USER);

        if (!params.userID) {
            throw new Error(SUBMODULE_ERROR.INVALID_USERID);
        }

        const user = await this.userCollection.aggregate([{ "$match": { _id: params.userID } }]);
        if (!user || !Array.isArray(user) || user.length < 1 || user[0]?._id !== params.userID) {
            throw new Error(SUBMODULE_ERROR.USER_NOT_FOUND);
        }
        const updatedUser = {};
        if (params.role && Object.values(USER.ROLES).includes(params.role)) {
            updatedUser.role = params.role;
        }

        if(!params?.studies && USER.ROLES.SUBMITTER === params.role) {
            throw new Error(SUBMODULE_ERROR.APPROVED_STUDIES_REQUIRED);
        }

        const isValidUserStatus = Object.values(USER.STATUSES).includes(params.status);
        if (params.status) {
            if (isValidUserStatus) {
                updatedUser.userStatus = params.status;
            } else {
                throw new Error(SUBMODULE_ERROR.INVALID_USER_STATUS);
            }
        }

        updatedUser.dataCommons = DataCommon.get(user[0]?.dataCommons, params?.dataCommons);
        await this.#setUserPermissions(user[0]?.role, params?.role, params?.permissions, params?.notifications, updatedUser);
        return await this.updateUserInfo(user[0], updatedUser, params.userID, params.status, params.role, params?.studies);
    }
    async updateUserInfo(prevUser, updatedUser, userID, status, role, approvedStudyIDs) {
        // add studies to user.
        const validStudies = await this.#findApprovedStudies(approvedStudyIDs);
        if (approvedStudyIDs && approvedStudyIDs.length > 0) {
            if(validStudies.length !== approvedStudyIDs.length && !approvedStudyIDs?.includes("All")) {
                throw new Error(SUBMODULE_ERROR.INVALID_NOT_APPROVED_STUDIES);
            }
            else {
                // ** Must store Approved studies ID only **
                if (approvedStudyIDs?.includes("All")) {
                    updatedUser.studies = [{_id: "All"}];
                } else {
                    updatedUser.studies = approvedStudyIDs.map(str => ({ _id: str }));
                }
            }
        }
        else
            updatedUser.studies = [];

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
            throw new Error(SUBMODULE_ERROR.UPDATE_FAILED);
        }

        if (userAfterUpdate.studies) {
            userAfterUpdate.studies = validStudies; // return approved studies dynamically with all properties of studies
        }
        return { ...prevUser, ...userAfterUpdate};
    }

    async #notifyUpdatedUser(prevUser, newUser, newRole) {
        if (newUser?.notifications?.includes(EN.USER_ACCOUNT.USER_ACCESS_CHANGED)) {
            const baseRoleCondition = newRole && Object.values(USER.ROLES).includes(newRole);
            const isRoleChange = baseRoleCondition && prevUser.role !== newUser.role;
            const isDataCommonsChange = newUser?.dataCommons?.length > 0 && JSON.stringify(prevUser?.dataCommons) !== JSON.stringify(newUser?.dataCommons);
            const isStudiesChange = newUser.studies?.length > 0 && JSON.stringify(prevUser.studies) !== JSON.stringify(newUser.studies);
            if (isRoleChange || isDataCommonsChange || isStudiesChange) {
                const userDataCommons = [USER.ROLES.DATA_COMMONS_PERSONNEL].includes(newUser.role) ? newUser.dataCommons : undefined;
                const studyNames = await this.#findStudiesNames(newUser.studies);
                await this.notificationsService.userRoleChangeNotification(newUser.email,
                    {
                        accountType: newUser.IDP,
                        email: newUser.email,
                        role: newUser.role,
                        dataCommons: userDataCommons,
                        ...([USER.ROLES.SUBMITTER, USER.ROLES.FEDERAL_LEAD].includes(newUser.role) && { studies: studyNames }),
                    },
                    {url: this.appUrl, helpDesk: `${this.officialEmail}.`});
            }
        }
    }

    async #notifyDeactivatedUser(prevUser, newStatus) {
        const isUserActivated = prevUser?.userStatus !== USER.STATUSES.INACTIVE;
        const isStatusChange = newStatus && newStatus?.toLowerCase() === USER.STATUSES.INACTIVE.toLowerCase();
        if (isUserActivated && isStatusChange) {
            if (prevUser?.notifications?.includes(EN.USER_ACCOUNT.USER_INACTIVATED)) {
                await this.notificationsService.deactivateUserNotification(prevUser.email,
                    {firstName: prevUser.firstName},
                    {officialEmail: `${this.officialEmail}.`});
            }
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

    async getAdminPBACUsers() {
        const orgOwnerOrAdminRole = {
            "userStatus": USER.STATUSES.ACTIVE,
            "notifications": {"$in": [EN.USER_ACCOUNT.USER_INACTIVATED_ADMIN]},
            "$or": [{"role": USER.ROLES.ADMIN}]
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
     * get Data Commons Personnel
     * @param {*} dataCommons
     * @returns {Promise<Array>} user[]
     */
    async getDCPs(dataCommons) {
        const dataCommonsArr = Array.isArray(dataCommons) ? dataCommons : [dataCommons];
        const query= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.DATA_COMMONS_PERSONNEL,
            ...(dataCommonsArr.includes("All") ? {} : { "dataCommons": {$in: dataCommonsArr} })
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
                [USER_FIELDS.STATUS]: USER.STATUSES.ACTIVE,
                // Disable auto-deactivated for NIH user
                [USER_FIELDS.IDP]: {$not: {$regex: this.#NIH, $options: "i"}},
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
                            $lt: subtractDaysFromNowTimestamp(this.inactiveUserDays)
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

    #validateUserPermission(isUserRoleChange, userRole, permissions, notifications, accessControl) {
        const invalidPermissions = permissions?.filter(permission => !this.#allPermissionNamesSet.has(permission));

        if (invalidPermissions?.length > 0) {
            throw new Error(replaceErrorString(ERROR.INVALID_PERMISSION_NAME, `${invalidPermissions.join(',')}`));
        }
        const invalidNotifications = notifications?.filter(notification => !this.#allEmailNotificationNamesSet.has(notification));

        if (invalidNotifications?.length > 0) {
            throw new Error(replaceErrorString(ERROR.INVALID_NOTIFICATION_NAME, `${invalidNotifications.join(',')}`));
        }

        return {
            filteredPermissions: this.#setFilteredPermissions(isUserRoleChange, userRole, permissions, accessControl?.permissions?.permitted, accessControl?.permissions?.getInherited),
            filteredNotifications: this.#setFilteredNotifications(isUserRoleChange, userRole, notifications, accessControl?.notifications?.permitted)
        }
    }
    // note for inheritedCallback; Some permissions are automatically enforced if they are inherited from the PBAC settings.
    #setFilteredPermissions(isUserRoleChange, userRole, permissions, defaultPermissions, inheritedCallback) {
        const updatedPermissions = isUserRoleChange && permissions === undefined ? defaultPermissions : permissions;
        return [...(updatedPermissions || []), ...inheritedCallback(updatedPermissions)];
    }

    #setFilteredNotifications(isUserRoleChange, userRole, notifications, defaultNotifications) {
        const updatedNotifications = isUserRoleChange && notifications === undefined ? defaultNotifications : notifications;
        return [...(updatedNotifications || [])];
    }

    async #setUserPermissions(currRole, newRole, permissions, notifications, updatedUser) {
        const isUserRoleChange = (newRole && (currRole !== newRole));
        const userRole = isUserRoleChange ? newRole : currRole;
        const accessControl = await this.configurationService.getAccessControl(userRole);
        const {filteredPermissions, filteredNotifications} =
            this.#validateUserPermission(isUserRoleChange, userRole, permissions, notifications, accessControl);

        if (isUserRoleChange || (!isUserRoleChange && permissions !== undefined)) {
            if (!isIdenticalArrays(currRole?.permissions, filteredPermissions) && filteredPermissions) {
                updatedUser.permissions = new Set(filteredPermissions || []).toArray();
            }
        }

        if (isUserRoleChange || (!isUserRoleChange && notifications !== undefined)) {
            if (!isIdenticalArrays(currRole?.notifications, filteredNotifications) && filteredNotifications) {
                updatedUser.notifications = new Set(filteredNotifications).toArray();
            }
        }
    } 
    async getCollaboratorsByStudyID(studyID, submitterID) {
        const query = {
            _id: {"$ne": submitterID},
            "role": USER.ROLES.SUBMITTER,
            "userStatus": USER.STATUSES.ACTIVE,
            "permissions": {"$in": [USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.CREATE]},
            "$or": [{"studies": {"$in": [studyID, "All"]}}, {"studies._id": {"$in": [studyID, "All"]}}]
        }; // user's studies contains studyID
        const users = await this.userCollection.aggregate([{"$match": query}]);
        for (const user of users) {
            user.studies = await this.#findApprovedStudies(user.studies);
        }
        return users
    }

    /**
     * Fetches a list of users based on specified notifications and optional roles.
     *
     * @param {Array} notifications - An array of notification.
     * @param {Array} [roles=[]] - An optional array of user roles.
     * @returns {Promise<Array>} - An array of user documents.
     */
    async getUsersByNotifications(notifications, roles = []) {
        return await this.userCollection.aggregate([{"$match": {
                "userStatus": USER.STATUSES.ACTIVE,
                "notifications": {
                    "$in": notifications
                },
                ...(roles?.length > 0 && { "role": { "$in": roles } })
            }
        }]);
    }
}


class DataCommon {
    constructor(currentDataCommons, newDataCommons) {
        this.currentDataCommons = currentDataCommons;
        this.newDataCommons = newDataCommons;
    }

    /**
     * Get the new data commons based on the user's role & data commons.
     *
     * @param {Array} currentDataCommons - The current data commons in the user collection.
     * @param {Array} newDataCommons - The new data commons to update the user.
     * @returns {Array} - return a data commons array.
     */

    static get(currentDataCommons, newDataCommons) {
        const dataCommons = new DataCommon(currentDataCommons, newDataCommons);
        return dataCommons.#getDataCommons() || [];
    }

    #getDataCommons() {
        return this.newDataCommons === undefined ? this.currentDataCommons : this.newDataCommons;
    }
}

function isIdenticalArrays(arr1, arr2) {
    if (arr1?.length !== arr2?.length) return false;
    return arr1.every(value => arr2?.includes(value));
}

module.exports = {
    UserService
};