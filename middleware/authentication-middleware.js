const {verifySession} = require("../verifier/user-info-verifier");
const config = require("../config");
const ERROR = require("../constants/error-constants");
const {decodeToken} = require("../verifier/token-verifier");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);

let verifyTokenIsWhitelisted;
let getUser;
dbConnector.connect().then(async () => {
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    getUser = async (userID) => {
        const response = await userCollection.find(userID);
        if (!response || response.length < 1) {
            return null;
        }
        return response[0];
    }
    verifyTokenIsWhitelisted = async (token, userID) => {
        const response = await userCollection.find(userID);
        if (!response || response.length < 1) {
            return false;
        }
        const user = response[0];
        let whitelist = user?.tokens || []
        return whitelist.includes(token);
    };
});

module.exports = async (req, res, next) => {
    let token = req?.headers?.authorization || "";
    const hasToken = token.split(' ').length > 1;
    const hasSession = !!req?.session?.userInfo;
    if (!hasSession && !hasToken){
        // request has neither an active session cookie nor a token
        throw new Error(ERROR.INVALID_SESSION_OR_TOKEN);
    }
    if (!hasSession && hasToken){
        // request has a token and does not have an active session cookie
        token = token.split(' ')[1];
        const userInfo = decodeToken(token, config.token_secret);
        const userID = userInfo?._id;
        if (!userID) {
            // token does not contain a user id
            throw new Error(ERROR.INVALID_TOKEN_NO_USER_ID);
        }
        const user = await getUser(userID);
        if (!user){
            // the user ID encoded in the token does not correspond to a user account
            throw new Error(ERROR.INVALID_TOKEN_INVALID_USER_ID);
        }
        let whitelist = user?.tokens || []
        if (!whitelist.includes(token)) {
            // token is not present in the corresponding user's whitelist
            throw new Error(ERROR.INVALID_TOKEN_NOT_IN_WHITELIST);
        }
        // create active user session
        req.session.userInfo = user;
    }
    // there is an active user session
    next()
}
