const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {AWSService} = require("../services/aws-request");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION, SUBMISSION_COLLECTION, API_TOKEN} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");
const ERROR = require("../constants/error-constants");
const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);

let root;
dbConnector.connect().then(() => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSION_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days};
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const userService = new User(userCollection, logCollection);
    const dataInterface = new Application(logCollection, applicationCollection, submissionCollection, new Organization(organizationCollection), userService, dbService, notificationsService, emailParams);
    const awsService = new AWSService(submissionCollection, userService, new Organization(organizationCollection));
    root = {
        version: () => {return config.version},
        saveApplication: dataInterface.saveApplication.bind(dataInterface),
        getApplication: dataInterface.getApplication.bind(dataInterface),
        reviewApplication: dataInterface.reviewApplication.bind(dataInterface),
        getMyLastApplication: dataInterface.getMyLastApplication.bind(dataInterface),
        listApplications: dataInterface.listApplications.bind(dataInterface),
        submitApplication: dataInterface.submitApplication.bind(dataInterface),
        approveApplication: dataInterface.approveApplication.bind(dataInterface),
        rejectApplication: dataInterface.rejectApplication.bind(dataInterface),
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: dataInterface.deleteApplication.bind(dataInterface),
        createTempCredentials: awsService.createTempCredentials.bind(awsService)
    };
});

const extractContext =(req) => {
    context = null;
    token = req.headers.authorization;
    if(token && token.split(' ').length > 1) {
        token = token.split(' ')[1];
        context = {"api-token":  token} ;
    }
    else context = req.session;
    if(!context) throw new Error(ERROR.INVALID_SESSION_OR_TOKEN);
    return context;
};

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: extractContext(req)
    })(req,res);
};
