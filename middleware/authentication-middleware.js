const config = require("../config");
const {DATABASE_NAME, USER_COLLECTION, ORGANIZATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const AuthenticationService = require("../services/authentication-service");
const UserInitializationService = require("../services/user-initialization-service");
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);


let authenticationService, userInitializationService;
dbConnector.connect().then(async () => {
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    authenticationService = new AuthenticationService(userCollection);
    userInitializationService = new UserInitializationService(userCollection, organizationCollection);
});

module.exports = async (req, res, next) => {
    let userID = req.session?.userInfo?.userID;
    let userInfo = await authenticationService.verifyAuthenticated(req.session?.userInfo, req?.headers?.authorization);
    if (!userID){
        // session is not initialized
        req.session.userInfo = await userInitializationService.initializeUser(userInfo);
    }
    next()
}
