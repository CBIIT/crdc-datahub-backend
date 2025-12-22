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
    ORGANIZATION_COLLECTION, SUBMISSIONS_COLLECTION, DATA_RECORDS_COLLECTION, VALIDATION_COLLECTION,
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
        const configurationService = new ConfigurationService();
        const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
        const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
        const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection, approvedStudiesCollection);
        const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, userCollection, organizationService, submissionCollection);

        const userService = new UserService(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.emails_url, approvedStudiesService, config.inactive_user_days);
        const s3Service = new S3Service();

        const awsService = new AWSService(submissionCollection, userService, config.role_arn, config.presign_expiration);
        
        const utilityService = new UtilityService();
        const fetchDataModelInfo = async () => {
            return utilityService.fetchJsonFromUrl(config.model_url)
        };
        
        const batchService = new BatchService(s3Service, config.sqs_loader_queue, awsService, config.prod_url, fetchDataModelInfo);

        const qcResultCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, QC_RESULTS_COLLECTION);
        const qcResultsService = new QcResultService(qcResultCollection, submissionCollection);

        const releaseCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, RELEASE_DATA_RECORDS_COLLECTION);
        const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
        const dataRecordArchiveCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_ARCHIVE_COLLECTION);
        const dataRecordService = new DataRecordService(dataRecordCollection, dataRecordArchiveCollection, releaseCollection, config.file_queue, config.metadata_queue, awsService, s3Service, qcResultsService, config.export_queue);

        const validationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, VALIDATION_COLLECTION);
        const submissionService = new Submission(logCollection, submissionCollection, batchService, userService,
            organizationService, notificationsService, dataRecordService, fetchDataModelInfo, awsService, config.export_queue,
            s3Service, emailParams, config.dataCommonsList, config.hiddenModels, validationCollection, config.sqs_loader_queue, qcResultsService, 
            config.uploaderCLIConfigs, config.submission_bucket, configurationService);

        const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, null, configurationService, null);
        
        
        cronJob.schedule(config.scheduledJobTime, async () => {
            // Log the start time of the cron job
            const cronStartTime = getCurrentTime();
            console.log(`Starting scheduled tasks at ${cronStartTime}`);
            
            // Timeout constants
            const FIVE_MINUTE_TIMEOUT = 5 * 60 * 1000;
            
            
            // Sequential tasks - all tasks run one after another
            const tasks = [
                {
                    name: "deleteInactiveApplications",
                    description: "Delete inactive submission requests",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => dataInterface.deleteInactiveApplications(),
                    dependencies: [] // No dependencies
                },
                {
                    name: "runDeactivateInactiveUsers",
                    description: "Disable inactive users", 
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => runDeactivateInactiveUsers(userService, notificationsService, config.inactive_user_days, emailParams),
                    dependencies: [] // No dependencies
                },
                {
                    name: "deleteInactiveSubmissions",
                    description: "Delete inactive submissions then delete any orphaned data and files",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => submissionService.deleteInactiveSubmissions(),
                    dependencies: [] // No dependencies
                },
                {
                    name: "remindApplicationSubmission", 
                    description: "Send reminder email for inactive submission requests",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => dataInterface.remindApplicationSubmission(),
                    dependencies: ["deleteInactiveApplications"] // Don't remind about deleted applications
                },
                {
                    name: "remindInactiveSubmission",
                    description: "Send reminder email for inactive submissions",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => submissionService.remindInactiveSubmission(),
                    dependencies: ["deleteInactiveSubmissions"] // Don't remind about deleted submissions
                },
                {
                    name: "archiveSubmissions",
                    description: "Archive completed submissions",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => submissionService.archiveSubmissions(),
                    dependencies: [] // No dependencies
                },
                {
                    name: "purgeDeletedDataFiles",
                    description: "Purge deleted data files from S3",
                    timeout: FIVE_MINUTE_TIMEOUT,
                    fn: () => submissionService.purgeDeletedDataFiles(),
                    dependencies: [] // No dependencies
                }
            ];

            const results = [];
            let totalExecutionTime = 0;

            // Execute tasks sequentially, one after another
            for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
                const task = tasks[taskIndex];
                console.log(`Executing Task ${taskIndex + 1}/${tasks.length}: ${task.description}`);
                
                const taskStartTime = getCurrentTime();
                
                // Check if any dependencies failed or were skipped
                const incompleteDependencies = task.dependencies.filter(depName => {
                    const depResult = results.find(r => r.name === depName);
                    return depResult && (depResult.status === 'failed' || depResult.status === 'skipped');
                });
                
                if (incompleteDependencies.length > 0) {
                    console.log(`Skipping ${task.description} - dependency failed or skipped: ${incompleteDependencies.join(', ')}`);
                    
                    const result = {
                        name: task.name,
                        status: 'skipped',
                        duration: 0,
                        startTime: taskStartTime,
                        endTime: taskStartTime,
                        error: `Dependency failed or skipped: ${incompleteDependencies.join(', ')}`,
                        taskNumber: taskIndex + 1
                    };
                    
                    results.push(result);
                    continue;
                }
                
                
                console.log(`Running scheduled task: ${task.description} at ${taskStartTime}`);
                
                try {
                    // Create timeout promise
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`Task timeout after ${task.timeout}ms`));
                        }, task.timeout);
                    });

                    // Enforce timeout for each task
                    await Promise.race([
                        task.fn(),
                        timeoutPromise
                    ]);
                    
                    const taskEndTime = getCurrentTime();
                    const taskDuration = taskEndTime - taskStartTime;
                    
                    const result = {
                        name: task.name,
                        status: 'success',
                        duration: taskDuration,
                        startTime: taskStartTime,
                        endTime: taskEndTime,
                        taskNumber: taskIndex + 1
                    };
                    
                    console.log(`Completed ${task.description} successfully in ${taskDuration}ms`);
                    results.push(result);
                    totalExecutionTime += taskDuration;
                } catch (error) {
                    const taskEndTime = getCurrentTime();
                    const taskDuration = taskEndTime - taskStartTime;
                    
                    const result = {
                        name: task.name,
                        status: 'failed',
                        duration: taskDuration,
                        startTime: taskStartTime,
                        endTime: taskEndTime,
                        error: error.message,
                        taskNumber: taskIndex + 1
                    };
                    
                    if (error.message.includes('Task timeout')) {
                        console.error(`${task.description} timed out after ${task.timeout}ms`);
                    } else {
                        console.error(`Failed ${task.description} after ${taskDuration}ms:`, error.message);
                    }
                    results.push(result);
                    totalExecutionTime += taskDuration;
                }
                
                console.log(`--- Task ${taskIndex + 1} completed ---`);
            }

            const cronEndTime = getCurrentTime();
            const successfulTasks = results.filter(r => r.status === 'success').length;
            const failedTasks = results.filter(r => r.status === 'failed').length;
            const skippedTasks = results.filter(r => r.status === 'skipped').length;
            const timeoutTasks = results.filter(r => r.error && r.error.includes('Task timeout')).length;
            const totalTasks = results.length;
            
            console.log(`Scheduled tasks completed at ${cronEndTime}`);
            console.log(`Total tasks: ${totalTasks}, Successful: ${successfulTasks}, Failed: ${failedTasks}, Skipped: ${skippedTasks}, Timeouts: ${timeoutTasks}`);
            console.log(`Total execution time: ${totalExecutionTime}ms`);
            
            
            
            if (failedTasks > 0) {
                console.error(`Failed tasks:`, results.filter(r => r.status === 'failed').map(r => `Task ${r.taskNumber} - ${r.name}: ${r.error}`));
            }
            
            if (skippedTasks > 0) {
                console.warn(`Skipped tasks:`, results.filter(r => r.status === 'skipped').map(r => `Task ${r.taskNumber} - ${r.name}: ${r.error}`));
            }
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