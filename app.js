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
    ORGANIZATION_COLLECTION, SUBMISSIONS_COLLECTION, BATCH_COLLECTION, DATA_RECORDS_COLLECTION, VALIDATION_COLLECTION,
    CONFIGURATION_COLLECTION, DATA_RECORDS_ARCHIVE_COLLECTION
} = require("./crdc-datahub-database-drivers/database-constants");
const {Application} = require("./services/application");
const {Submission} = require("./services/submission");
const {DataRecordService} = require("./services/data-record-service");
const {S3Service} = require("./crdc-datahub-database-drivers/services/s3-service");
const {MongoQueries} = require("./crdc-datahub-database-drivers/mongo-queries");
const {DatabaseConnector} = require("./crdc-datahub-database-drivers/database-connector");
const {getCurrentTime, subtractDaysFromNow} = require("./crdc-datahub-database-drivers/utility/time-utility");
const {EmailService} = require("./services/email");
const {NotifyUser} = require("./services/notify-user");
const {User} = require("./crdc-datahub-database-drivers/services/user");
const {extractAndJoinFields} = require("./utility/string-util");
const {ApprovedStudiesService} = require("./services/approved-studies");
const {USER} = require("./crdc-datahub-database-drivers/constants/user-constants");
const {Organization} = require("./crdc-datahub-database-drivers/services/organization");
const {LOGIN, REACTIVATE_USER} = require("./crdc-datahub-database-drivers/constants/event-constants");
const {BatchService} = require("./services/batch-service");
const {AWSService} = require("./services/aws-request");
const {UtilityService} = require("./services/utility");
const authenticationMiddleware = require("./middleware/authentication-middleware");
const {ConfigurationService} = require("./services/configurationService");
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

// // authentication middleware
// app.use(async (req, res, next) => {
//     try{
//         await authenticationMiddleware(req, res, next);
//     }
//     catch(error){
//         next(error);
//     }
// });

// add graphql endpoint
app.use("/api/graphql", graphqlRouter);
const INACTIVE_SUBMISSION_DAYS = "Inactive_Submission_Notify_Days";
cronJob.schedule(config.schedule_job, async () => {
    const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
    const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    dbConnector.connect().then( async () => {
        const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
        const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);

        const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
        const configurationService = new ConfigurationService(configurationCollection)
        const inactiveSubmissionConf = await configurationService.findByType(INACTIVE_SUBMISSION_DAYS);
        const inactiveSubmissionsTimeout = Array.isArray(inactiveSubmissionConf?.timeout) && inactiveSubmissionConf?.timeout?.length > 0 ? inactiveSubmissionConf?.timeout : [7, 30, 60];
        const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
            submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk, remindSubmissionDay: inactiveSubmissionsTimeout,
            finalRemindSubmissionDay: config.inactive_submission_days || 120};
        const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
        const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
        const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection);

        const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
        const organizationService = new Organization(organizationCollection);
        const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSIONS_COLLECTION);
        const userService = new User(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.tier);

        const s3Service = new S3Service();
        const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
        const awsService = new AWSService(submissionCollection, userService);
        const batchService = new BatchService(s3Service, batchCollection, config.sqs_loader_queue, awsService);

        const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
        const dataRecordArchiveCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_ARCHIVE_COLLECTION);
        const dataRecordService = new DataRecordService(dataRecordCollection, dataRecordArchiveCollection, config.file_queue, config.metadata_queue, awsService);

        const utilityService = new UtilityService();
        const dataModelInfo = await utilityService.fetchJsonFromUrl(config.model_url);
        const validationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, VALIDATION_COLLECTION);
        const submissionService = new Submission(logCollection, submissionCollection, batchService, userService, organizationService, notificationsService, dataRecordService, config.tier, dataModelInfo, awsService, config.export_queue, s3Service, emailParams, config.dataCommonsList, config.hiddenModels, validationCollection);
        const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, config.tier, emailParams);

        console.log("Running a scheduled background task to delete inactive application at " + getCurrentTime());
        await dataInterface.deleteInactiveApplications();
        console.log("Running a scheduled job to disable user(s) because of no activities at " + getCurrentTime());
        await runDeactivateInactiveUsers(userService, notificationsService);
        console.log("Running a scheduled background task to remind inactive application at " + getCurrentTime());
        await dataInterface.remindApplicationSubmission();
        console.log("Running a scheduled background task to remind inactive submission at " + getCurrentTime());
        await submissionService.remindInactiveSubmission();
        console.log("Running a scheduled job to delete inactive data submission and related data ann files at " + getCurrentTime());
        await submissionService.deleteInactiveSubmissions();
        console.log("Running a scheduled job to archive completed submissions at " + getCurrentTime());
        await submissionService.archiveCompletedSubmissions();
        await dbConnector.disconnect();
    });
});

const runDeactivateInactiveUsers = async (userService, notificationsService) => {
    const usersToBeInactivated = await userService.checkForInactiveUsers([LOGIN, REACTIVATE_USER]);
    const disabledUsers = await userService.disableInactiveUsers(usersToBeInactivated);
    if (disabledUsers.length > 0) {
        // Email disabled user(s)
        await Promise.all(disabledUsers.map(async (user) => {
            await notificationsService.inactiveUserNotification(user.email,
                {firstName: user.firstName},
                {inactiveDays: config.inactive_user_days, officialEmail: config.official_email},
                config.tier);
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
                    config.tier);
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