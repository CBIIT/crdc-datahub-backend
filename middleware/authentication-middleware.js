
const {parse} = require("graphql");
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

// escape public query 
const escape = (req) => {
    if(req.body && req.body.query){
        try {
            const parsedQuery = parse(req.body.query);
            const api_name= parsedQuery.definitions.find(
              (definition) => definition.kind === 'OperationDefinition'
            ).selectionSet?.selections[0]?.name?.value;
            return ['retrieveCDEs'].includes(api_name);
          } catch (error) {
            console.error('Failed to parse query:', error.message);
          }
        return true;
    }
}

module.exports = async (req, res, next) => {
    if(!escape(req)) {
        let userID = req.session?.userInfo?.userID;
        let userInfo = await authenticationService.verifyAuthenticated(req.session?.userInfo, req?.headers?.authorization);
        if (!userID){
            // session is not initialized
            req.session.userInfo = await userInitializationService.initializeUser(userInfo);
        }
    }
    next();
}
