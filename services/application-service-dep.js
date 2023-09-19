const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, LOG_COLLECTION, ORGANIZATION_COLLECTION, USER_COLLECTION, APPLICATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {EmailService} = require("./email");
const {NotifyUser} = require("./notify-user");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");
const {Application} = require("./application");

const initApplicationService = async (config, dbConnector) => {
    const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const emailParams = { url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_user_days, remindDay: config.remind_application_days };
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const userService = new User(userCollection, logCollection);
    const organizationService = new Organization(organizationCollection);
    return new Application(logCollection, applicationCollection, organizationService, userService, dbService, notificationsService, emailParams);
};

module.exports = {
    initApplicationService
};