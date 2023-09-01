const express = require('express');
const fs = require('fs');
const {join} = require("path");
const cors = require('cors');
const logger = require('morgan');
const createError = require('http-errors');
const config = require('./config');
const cronJob = require("node-cron");
const createSession = require("./crdc-datahub-database-drivers/session-middleware");
const statusRouter = require("./routers/status-endpoints-router");
const graphqlRouter = require("./routers/graphql-router");
const {MongoDBCollection} = require("./crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION} = require("./crdc-datahub-database-drivers/database-constants");
const {Application} = require("./services/application");
const {MongoQueries} = require("./crdc-datahub-database-drivers/mongo-queries");
const {DatabaseConnector} = require("./crdc-datahub-database-drivers/database-connector");
const {getCurrentTimeYYYYMMDDSS} = require("./utility/time-utility");
const {EmailService} = require("./services/email");
const {NotifyUser} = require("./services/notify-user");
const {User} = require("./crdc-datahub-database-drivers/services/user");
const {Organization} = require("./services/organization");
// print environment variables to log
console.info(config);

// create logs folder if it does not already exist
const LOGS_FOLDER = 'logs';
if (!fs.existsSync(LOGS_FOLDER)) fs.mkdirSync(LOGS_FOLDER);

// create a log write stream in append mode
const accessLogStream = fs.createWriteStream(join(__dirname, LOGS_FOLDER, 'access.log'), { flags: 'a'});

// initialize the app
const app = express();
app.use(cors());
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(join(__dirname, 'public')));

// add ping and version endpoints
app.use("/", statusRouter);

// create session
app.use(createSession(config.session_secret, config.session_timeout, config.mongo_db_connection_string));

// add graphql endpoint
app.use("/api/graphql", graphqlRouter);

cronJob.schedule(config.schedule_job, async () => {
    const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
    const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    dbConnector.connect().then( async () => {
        const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
        const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
        const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
        const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_user_days, remindDay: config.remind_application_days};
        const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
        const userService = new User(userCollection, logCollection);
        const dataInterface = new Application(logCollection, applicationCollection, new Organization(organizationCollection), userService, dbService, notificationsService, emailParams);
        console.log("Running a scheduled background task to delete inactive application at " + getCurrentTimeYYYYMMDDSS());
        await dataInterface.deleteInactiveApplications(config.inactive_user_days);
        console.log("Running a scheduled background task to remind inactive application at " + getCurrentTimeYYYYMMDDSS());
        await dataInterface.remindApplicationSubmission(config.remind_application_days);
    });
});

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError(404));
});
// error handler
app.use((err, req, res, next) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.json(res.locals.message);
});

module.exports = app;
