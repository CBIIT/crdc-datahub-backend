const {verifySession} = require("../verifier/user-info-verifier");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const ERROR = require("../constants/error-constants");
const SUBMODULE_ERROR = require("../crdc-datahub-database-drivers/constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const config = require("../config");
const {getCurrentTime, subtractDaysFromNowTimestamp} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {UpdateProfileEvent, ReactivateUserEvent} = require("../crdc-datahub-database-drivers/domain/log-events");
const {LOG_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const jwt = require("jsonwebtoken");


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
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, appUrl, tier, approvedStudiesService, inactiveUserDays) {
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
        this.approvedStudiesCollection = approvedStudiesService.approvedStudiesCollection;
        this.inactiveUserDays = inactiveUserDays;
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
        isLoggedInOrThrow(context);
        if (!params?.userID) {
            throw new Error(SUBMODULE_ERROR.INVALID_USERID);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(SUBMODULE_ERROR.INVALID_ROLE);
        }
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(SUBMODULE_ERROR.NO_ORG_ASSIGNED);
        }
        const filters = { _id: params.userID };
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

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
        isLoggedInOrThrow(context);
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo?.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(SUBMODULE_ERROR.INVALID_ROLE);
        }
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(SUBMODULE_ERROR.NO_ORG_ASSIGNED);
        }

        const filters = {};
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

        const result = await this.userCollection.aggregate([{
            "$match": filters
        },]);

        for (let user of result) {
            user.studies = await this.#findApprovedStudies(user?.studies);
        }
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
            throw new Error(SUBMODULE_ERROR.NOT_LOGGED_IN);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN) {
            throw new Error(SUBMODULE_ERROR.INVALID_ROLE);
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

        if(!params?.studies && ![USER.ROLES.ADMIN, USER.ROLES.USER, USER.ROLES.CURATOR, USER.ROLES.DC_POC, USER.ROLES.DATA_COMMONS_PERSONNEL].includes(params.role)){
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

        if (isCurator) {
            updatedUser.organization = null;
        }

        updatedUser.dataCommons = DataCommon.get(user[0]?.role, user[0]?.dataCommons, params?.role, params?.dataCommons);
        return await this.updateUserInfo(user[0], updatedUser, params.userID, params.status, params.role, params?.studies);
    }
    async updateUserInfo(prevUser, updatedUser, userID, status, role, approvedStudyIDs) {
        // add studies to user.
        const validStudies = await this.#findApprovedStudies(approvedStudyIDs);
        if (approvedStudyIDs && approvedStudyIDs.length > 0) {
            if(validStudies.length !== approvedStudyIDs.length) {
                throw new Error(SUBMODULE_ERROR.INVALID_NOT_APPROVED_STUDIES);
            }
            else {
                updatedUser.studies = (approvedStudyIDs instanceof Object)?approvedStudyIDs:approvedStudyIDs.map(str => ({ _id: str }));
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
        const baseRoleCondition = newRole && Object.values(USER.ROLES).includes(newRole);
        const isRoleChange = baseRoleCondition && prevUser.role !== newUser.role;
        const isOrgChange = Boolean(prevUser?.organization?.orgID) && prevUser?.organization?.orgID !== newUser?.organization?.orgID;
        const isDataCommonsChange = newUser?.dataCommons?.length > 0 && JSON.stringify(prevUser?.dataCommons) !== JSON.stringify(newUser?.dataCommons);
        const isStudiesChange = newUser.studies?.length > 0 && JSON.stringify(prevUser.studies) !== JSON.stringify(newUser.studies);
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
                    studies: studyNames
                },
                {url: this.appUrl, helpDesk: this.officialEmail}
                ,this.tier);
        }
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