const ERROR = require("../constants/error-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const orgToUserOrg = require("../crdc-datahub-database-drivers/utility/org-to-userOrg-converter");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");
const {v4} = require("uuid");
const {getDataCommonsDisplayNamesForUser} = require("../utility/data-commons-remapper");
const { isAllStudy } = require("../utility/study-utility");
const {formatName} = require("../utility/format-name");
class UserInitializationService {

    constructor(userCollection, organizationCollection, approvedStudiesCollection, configurationService) {
        this.userCollection = userCollection;
        this.organizationCollection = organizationCollection;
        this.approvedStudiesCollection = approvedStudiesCollection;
        this.configurationService = configurationService;
    }

    async getMyUser(params, context){
        return getDataCommonsDisplayNamesForUser(await this.initializeUser(context?.userInfo));
    }

    async initializeUser(userInfo) {
        const email = userInfo?.email;
        const IDP = userInfo?.IDP;
        if (!email || !IDP){
            // required user information is missing from userInfo
            throw new Error(ERROR.NOT_LOGGED_IN)
        }
        let user = await this._getUserByEmailAndIDP(email, IDP);
        let orgID = user?.organization?.orgID;
        if (!user){
            // create an account for the user
            user = await this._createNewUser(userInfo);
        }
        if(orgID){
            // add full organization info to user info
            user.organization = await this._getUserOrganization(orgID);
        }

        const isMaintenanceMode = await this.configurationService.isMaintenanceMode();
        if (isMaintenanceMode && user?.role !== USER.ROLES.ADMIN) {
            console.log(ERROR.MAINTENANCE_MODE, `userID: ${userInfo?._id}`)
            throw new Error(ERROR.MAINTENANCE_MODE);
        }

        return user;
    }

    async _getUserOrganization(orgID){
        let result = await this.organizationCollection.find(orgID);
        if (!result) {
            console.error("Organization lookup by orgID failed");
            throw new Error(ERROR.DATABASE_OPERATION_FAILED);
        }
        if (result.length < 1){
            console.warn(`User is assigned an orgID that does not exist: ${orgID}`);
            return {};
        }
        return orgToUserOrg(result[0]);
    }

    async _getUserByEmailAndIDP(email, IDP) {
        let result = await this.userCollection.aggregate([
            {
                "$match": {
                    email: email,
                    IDP: IDP,
                }
            },
            {"$sort": {createdAt: -1}}, // sort descending
            {"$limit": 1} // return one
        ]);
        if (!result) {
            console.error("User lookup by email and IDP failed");
            throw new Error(ERROR.DATABASE_OPERATION_FAILED);
        }
        if  (!result.length || result.length === 0){
            return null;
        }
        if ( result[0]?.studies && result[0]?.studies.length > 0) {
            let approvedStudies = null;
            const allStudy = isAllStudy(result[0]?.studies);
            if(allStudy){
                approvedStudies = [{_id: "All", studyName: "All"}];
                result[0].studies = approvedStudies;
            }
            else {
                const studiesIDs = (result[0]?.studies[0] instanceof Object) ? result[0]?.studies.map((study) => study?._id) : result[0]?.studies;
                approvedStudies = await this.approvedStudiesCollection.aggregate([{
                    "$match": {
                        "_id": { "$in": studiesIDs } 
                    }
                }])
            }
            result[0].studies = approvedStudies;
        }
        return result.length > 0 ? result[0] : null;
    }

    async _createNewUser(userInfo) {
        const email = userInfo?.email;
        const IDP = userInfo?.IDP;
        if (!email || !IDP){
            // required user information is missing from userInfo
            throw new Error(ERROR.CREATE_USER_MISSING_INFO)
        }
        let sessionCurrentTime = getCurrentTime();
        const accessControl = await this.configurationService.getAccessControl(USER.ROLES.USER);
        const firstName = userInfo?.firstName || email.split("@")[0];
        const lastName = userInfo?.lastName;
        const newUser = {
            _id: v4(),
            email: email,
            IDP: userInfo.IDP,
            userStatus: USER.STATUSES.ACTIVE,
            role: USER.ROLES.USER,
            organization: {},
            dataCommons: [],
            firstName: firstName,
            lastName: lastName,
            fullName: formatName({firstName, lastName}),
            createdAt: sessionCurrentTime,
            updateAt: sessionCurrentTime,
            permissions: accessControl?.permissions?.permitted,
            notifications: accessControl?.notifications.permitted
        };
        const result = await this.userCollection.insert(newUser);
        if (!result?.acknowledged){
            console.error("Inserting a new user into the Users collection failed");
            throw new Error(ERROR.DATABASE_OPERATION_FAILED);
        }
        return newUser;
    }
}

module.exports = UserInitializationService;
