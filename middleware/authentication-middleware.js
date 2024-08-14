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
dbConnector.connect().then(async () => {
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
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
    let token = req.headers.authorization;
    if (token && token.split(' ').length > 1) {
        token = token.split(' ')[1];
        const userInfo = decodeToken(token, config.token_secret);
        if (!userInfo) {
            throw new Error(ERROR.INVALID_TOKEN_NO_USER);
        }
        if (!userInfo._id) {
            throw new Error(ERROR.INVALID_TOKEN_NO_USER_ID);
        }
        if (!(await verifyTokenIsWhitelisted(token, userInfo._id))) {
            throw new Error(ERROR.INVALID_TOKEN_NOT_IN_WHITELIST);
        }
        // delete token expiration from userInfo
        // if the user tries to generate a new token while 'exp' is in 'userInfo' then an error will be thrown
        delete userInfo.exp;
        req.session.userInfo = userInfo;
    }
    if (!req?.session?.userInfo) {
        throw new Error(ERROR.INVALID_SESSION_OR_TOKEN);
    }
    next();
}
