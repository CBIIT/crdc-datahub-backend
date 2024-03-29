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
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, LOG_COLLECTION, APPROVED_STUDIES_COLLECTION,
    ORGANIZATION_COLLECTION
} = require("./crdc-datahub-database-drivers/database-constants");
const {Application} = require("./services/application");
const {MongoQueries} = require("./crdc-datahub-database-drivers/mongo-queries");
const {DatabaseConnector} = require("./crdc-datahub-database-drivers/database-connector");
const {getCurrentTime} = require("./crdc-datahub-database-drivers/utility/time-utility");
const {EmailService} = require("./services/email");
const {NotifyUser} = require("./services/notify-user");
const {User} = require("./crdc-datahub-database-drivers/services/user");
const {extractAndJoinFields} = require("./utility/string-util");
const {ApprovedStudiesService} = require("./services/approved-studies");
const {USER} = require("./crdc-datahub-database-drivers/constants/user-constants");
const {Organization} = require("./crdc-datahub-database-drivers/services/organization");
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
        const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
            submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk};
        const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
        const userService = new User(userCollection, logCollection);

        const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
        const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection);

        const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
        const organizationService = new Organization(organizationCollection);

        const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, config.devTier);
        console.log("Running a scheduled background task to delete inactive application at " + getCurrentTime());
        await dataInterface.deleteInactiveApplications();
        console.log("Running a scheduled job to disable user(s) because of no activities at " + getCurrentTime());
        await runDeactivateInactiveUsers(userService, notificationsService);
        console.log("Running a scheduled background task to remind inactive application at " + getCurrentTime());
        await dataInterface.remindApplicationSubmission();
        await dbConnector.disconnect();
    });
});

const runDeactivateInactiveUsers = async (userService, notificationsService) => {
    // if there is no user login detected in the log collection, we will deactivate these users.
    const allUsersByEmailAndIDP = await userService.getAllUsersByEmailAndIDP();
    const nonLogUsers = await userService.findUsersExcludingEmailAndIDP(allUsersByEmailAndIDP);
    const inactiveUsers = await userService.getInactiveUsers(config.inactive_user_days);
    // merge and remove duplicate users
    const inactiveUserConditions = [...new Map([...nonLogUsers, ...inactiveUsers].map((user) => [user.email + user.IDP, user])).values()];
    const disabledUsers = await userService.disableInactiveUsers(inactiveUserConditions);
    if (disabledUsers.length > 0) {
        // Email disabled user(s)
        await Promise.all(disabledUsers.map(async (user) => {
            await notificationsService.inactiveUserNotification(user.email,
                {firstName: user.firstName},
                {inactiveDays: config.inactive_user_days, officialEmail: config.official_email},
                config.devTier);
        }));
        // Email admin(s)
        const adminUsers = await userService.getAdminUserEmails();
        // This is for the organization in the email template.
        const users = disabledUsers.map(u => ({ ...u, organization: u?.organization?.orgName }));
        await Promise.all(adminUsers.map(async (admin) => {
            let disabledUserList = users;
            // users filter by an organization or all users for admin
            if (admin.role === USER.ROLES.ORG_OWNER) {
                disabledUserList = users.filter((u)=> u && u?.organization === admin?.organization?.orgName);
            }
            if (disabledUserList.length > 0) {
                const commaJoinedUsers = extractAndJoinFields(disabledUserList, ["firstName", "lastName", "email", "role", "organization"]);
                await notificationsService.inactiveUserAdminNotification(admin.email,
                    {firstName: admin.firstName,users: commaJoinedUsers},
                    {inactiveDays: config.inactive_user_days},
                    config.devTier);
            }
        }));
    }
}

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