const ERROR = require("../constants/error-constants");
const {decodeToken} = require("../verifier/token-verifier");
const config = require("../config");
const {USER} = require("../crdc-datahub-database-drivers/constants/user-constants");

class AuthenticationService {

    constructor(userCollection, configurationService) {
        this.userCollection = userCollection;
        this.configurationService = configurationService
    }

    async verifyAuthenticated(userInfo, token) {
        token = token || "";
        const isTokenInRequest = token.split(' ').length > 1;
        const doesSessionExist = !!userInfo?.email && !!userInfo?.IDP;
        if (!doesSessionExist && !isTokenInRequest){
            // request has neither an active user session nor a token
            throw new Error(ERROR.INVALID_SESSION_OR_TOKEN);
        }

        const isMaintenanceMode = await this.configurationService.isMaintenanceMode();
        if (isMaintenanceMode && userInfo?.role !== USER.ROLES.ADMIN) {
            console.log(ERROR.MAINTENANCE_MODE, `userID: ${userInfo?._id}`)
            throw new Error(ERROR.MAINTENANCE_MODE);
        }

        if (isTokenInRequest){
            token = token.split(' ')[1];
            const tokenUserInfo = decodeToken(token, config.token_secret);
            const userID = tokenUserInfo?._id;
            if (!userID) {
                // token does not contain a user id
                throw new Error(ERROR.INVALID_TOKEN_NO_USER_ID);
            }
            const user = await this.#getUser(userID);
            if (!user){
                // the user ID encoded in the token does not correspond to a user account
                throw new Error(ERROR.INVALID_TOKEN_INVALID_USER_ID);
            }

            if (user?.userStatus !== USER.STATUSES.ACTIVE) {
                throw new Error(ERROR.DISABLED_USER);
            }

            let whitelist = user?.tokens || []
            if (!whitelist.includes(token)) {
                // token is not present in the corresponding user's whitelist
                throw new Error(ERROR.INVALID_TOKEN_NOT_IN_WHITELIST);
            }
            return user;
        }
        return userInfo;
    }

    async #getUser(userID){
        const response = await this.userCollection.find(userID);
        if (!response || response.length < 1) {
            return null;
        }
        return response[0];
    }
}

module.exports = AuthenticationService;