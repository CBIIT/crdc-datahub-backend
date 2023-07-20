const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
let root;
dbConnector.connect().then(() => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const dataInterface = new Application(applicationCollection, dbService, notificationsService, config.emails_url);
    root = {
        version: () => {return config.version},
        saveApplication: dataInterface.saveApplication.bind(dataInterface),
        getApplication: dataInterface.getApplication.bind(dataInterface),
        getMyLastApplication: dataInterface.getMyLastApplication.bind(dataInterface),
        listApplications: dataInterface.listApplications.bind(dataInterface),
        submitApplication: dataInterface.submitApplication.bind(dataInterface),
        approveApplication: dataInterface.approveApplication.bind(dataInterface),
        rejectApplication: dataInterface.rejectApplication.bind(dataInterface),
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: dataInterface.deleteApplication.bind(dataInterface)
    };
});

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
