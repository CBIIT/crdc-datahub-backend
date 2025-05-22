const express = require('express');
const fs = require('fs');
const {join} = require("path");
const cors = require('cors');
const logger = require('morgan');
const createError = require('http-errors');
const configuration = require('./config');
const cronJob = require("node-cron");
const createSession = require("./crdc-datahub-database-drivers/session-middleware");
const statusRouter = require("./routers/status-endpoints-router");
const graphqlRouter = require("./routers/graphql-router");
const {MongoDBCollection} = require("./crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, LOG_COLLECTION, APPROVED_STUDIES_COLLECTION,
    ORGANIZATION_COLLECTION, SUBMISSIONS_COLLECTION, BATCH_COLLECTION, DATA_RECORDS_COLLECTION, VALIDATION_COLLECTION,
    DATA_RECORDS_ARCHIVE_COLLECTION, QC_RESULTS_COLLECTION, RELEASE_DATA_RECORDS_COLLECTION,  CONFIGURATION_COLLECTION
} = require("./crdc-datahub-database-drivers/database-constants");
const {Application} = require("./services/application");
const {Submission} = require("./services/submission");
const {DataRecordService} = require("./services/data-record-service");
const {S3Service} = require("./services/s3-service");
const {MongoQueries} = require("./crdc-datahub-database-drivers/mongo-queries");
const {DatabaseConnector} = require("./crdc-datahub-database-drivers/database-connector");
const {getCurrentTime} = require("./crdc-datahub-database-drivers/utility/time-utility");
const {EmailService} = require("./services/email");
const {NotifyUser} = require("./services/notify-user");
const {extractAndJoinFields} = require("./utility/string-util");
const {ApprovedStudiesService} = require("./services/approved-studies");
const {Organization} = require("./crdc-datahub-database-drivers/services/organization");
const {LOGIN, REACTIVATE_USER} = require("./crdc-datahub-database-drivers/constants/event-constants");
const {BatchService} = require("./services/batch-service");
const {AWSService} = require("./services/aws-request");
const {UtilityService} = require("./services/utility");
const {QcResultService} = require("./services/qc-result-service");
const {UserService} = require("./services/user");
const {ConfigurationService} = require("./services/configurationService");
const {EMAIL_NOTIFICATIONS} = require("./crdc-datahub-database-drivers/constants/user-permission-constants");
const USER_CONSTANTS = require("./crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
// print environment variables to log
console.info(configuration);

// create logs folder if it does not already exist
const LOGS_FOLDER = 'logs';
if (!fs.existsSync(LOGS_FOLDER)) fs.mkdirSync(LOGS_FOLDER);

// create a log write stream in append mode
const accessLogStream = fs.createWriteStream(join(__dirname, LOGS_FOLDER, 'access.log'), { flags: 'a'});

// initialize the app
const app = express();
app.use(cors());
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(join(__dirname, 'public')));

// add ping and version endpoints
app.use("/", statusRouter);

// create session
app.use(createSession(configuration.session_secret, configuration.session_timeout, configuration.mongo_db_connection_string));

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
// Start the cron job. The frequency time read from the database
(async () => {
    const dbConnector = new DatabaseConnector(configuration.mongo_db_connection_string);
    const dbService = new MongoQueries(configuration.mongo_db_connection_string, DATABASE_NAME);
    dbConnector.connect().then( async () => {
        const config = await configuration.updateConfig(dbConnector);
        const emailService = new EmailService(config.email_transport, config.emails_enabled);
        const notificationsService = new NotifyUser(emailService, config.tier);
        const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
        const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
        const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSIONS_COLLECTION);
        const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
            submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk, remindSubmissionDay: config.inactiveSubmissionNotifyDays,
            techSupportEmail: config.techSupportEmail, conditionalSubmissionContact: config.conditionalSubmissionContact, submissionGuideURL: config.submissionGuideUrl,
            completedSubmissionDays: config.completed_submission_days, inactiveSubmissionDays: config.inactive_submission_days, finalRemindSubmissionDay: config.inactive_submission_days,
            inactiveApplicationNotifyDays: config.inactiveApplicationNotifyDays};

        
        const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
        const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
        const configurationService = new ConfigurationService(configurationCollection)
        const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
        const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
        const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection, approvedStudiesCollection);
        const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, userCollection, organizationService, submissionCollection);

        const userService = new UserService(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.emails_url, approvedStudiesService, config.inactive_user_days);
        const s3Service = new S3Service();
        const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
        const awsService = new AWSService(submissionCollection, userService, config.role_arn, config.presign_expiration);
        const batchService = new BatchService(s3Service, batchCollection, config.sqs_loader_queue, awsService);

        const qcResultCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, QC_RESULTS_COLLECTION);
        const qcResultsService = new QcResultService(qcResultCollection, submissionCollection);

        const releaseCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, RELEASE_DATA_RECORDS_COLLECTION);
        const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
        const dataRecordArchiveCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_ARCHIVE_COLLECTION);
        const dataRecordService = new DataRecordService(dataRecordCollection, dataRecordArchiveCollection, releaseCollection, config.file_queue, config.metadata_queue, awsService, s3Service, qcResultsService, config.export_queue);

        const utilityService = new UtilityService();
        const fetchDataModelInfo = async () => {
            return utilityService.fetchJsonFromUrl(config.model_url)
        };
        const validationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, VALIDATION_COLLECTION);
        const submissionService = new Submission(logCollection, submissionCollection, batchService, userService,
            organizationService, notificationsService, dataRecordService, fetchDataModelInfo, awsService, config.export_queue,
            s3Service, emailParams, config.dataCommonsList, config.hiddenModels, validationCollection, config.sqs_loader_queue, qcResultsService, 
            config.uploaderCLIConfigs, config.submission_bucket, configurationService);

        const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, emailParams);
        cronJob.schedule(config.scheduledJobTime, async () => {
            // The delete application job should run before the inactive application reminder. Once the application deleted, the reminder email should not be sent.
            console.log("Running a scheduled background task to delete inactive application at " + getCurrentTime());
            await dataInterface.deleteInactiveApplications();
            console.log("Running a scheduled background task to remind inactive application at " + getCurrentTime());
            await dataInterface.remindApplicationSubmission();
            console.log("Running a scheduled job to disable user(s) because of no activities at " + getCurrentTime());
            await runDeactivateInactiveUsers(userService, notificationsService, config.inactive_user_days, emailParams);
            // The delete data-submission job should run before the inactive data-submission reminder. Once the submission deleted, the reminder email should not be sent.
            console.log("Running a scheduled job to delete inactive data submission and related data ann files at " + getCurrentTime());
            await submissionService.deleteInactiveSubmissions();
            console.log("Running a scheduled background task to remind inactive submission at " + getCurrentTime());
            await submissionService.remindInactiveSubmission();
            console.log("Running a scheduled job to archive completed submissions at " + getCurrentTime());
            await submissionService.archiveCompletedSubmissions();
            console.log("Running a scheduled job to purge deleted data files at " + getCurrentTime());
            await submissionService.purgeDeletedDataFiles();
        });
    });
})();

const runDeactivateInactiveUsers = async (userService, notificationsService, inactiveUserDays, emailParams) => {
    const usersToBeInactivated = await userService.checkForInactiveUsers([LOGIN, REACTIVATE_USER]);
    const disabledUsers = await userService.disableInactiveUsers(usersToBeInactivated);
    if (disabledUsers?.length > 0) {
        // Email disabled user(s) with PBAC enabled
        await Promise.all(disabledUsers.map(async (user) => {
            if (user?.notifications?.includes(EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED)) {
                await notificationsService.inactiveUserNotification(user.email,
                    {firstName: user.firstName},
                    {inactiveDays: inactiveUserDays, officialEmail: `${emailParams.officialEmail}.`},
                );
            }
        }));
        // Email PBAC enabled admin(s)
        const adminUsers = await userService.getAdminPBACUsers();
        const BCCUsers = await userService.getUsersByNotifications([EMAIL_NOTIFICATIONS.USER_ACCOUNT.USER_INACTIVATED_ADMIN],
            [ROLES.DATA_COMMONS_PERSONNEL, ROLES.FEDERAL_LEAD, ROLES.SUBMITTER]);
        const BCCUserEmails = BCCUsers
            ?.filter((aUser) => aUser?.email)
            ?.map((aUser)=> aUser.email);

        const disabledUserContents = disabledUsers.map(aUser => {
            return {
                name: `${aUser?.firstName} ${aUser?.lastName || ''}`,
                email: aUser?.email,
                role: aUser?.role,
            };
        });

        const toAdminEmails = adminUsers
            ?.filter((aUser) => aUser?.email)
            ?.map((aUser)=> aUser.email);

        const commaJoinedUsers = extractAndJoinFields(disabledUserContents, ["name", "email", "role"], ", ");
        await notificationsService.inactiveUserAdminNotification(toAdminEmails,
            BCCUserEmails,
            {users: commaJoinedUsers},
            {inactiveDays: inactiveUserDays},
        );
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