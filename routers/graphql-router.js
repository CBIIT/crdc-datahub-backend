const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {Submission} = require("../services/submission");
const {AWSService} = require("../services/aws-request");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, SUBMISSIONS_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    APPROVED_STUDIES_COLLECTION, BATCH_COLLECTION,
    DATA_RECORDS_COLLECTION
} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {ApprovedStudiesService} = require("../services/approved-studies");
const {BatchService} = require("../services/batch-service");
const {S3Service} = require("../crdc-datahub-database-drivers/services/s3-service");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");
const ERROR = require("../constants/error-constants");
const {DataRecordService} = require("../services/data-record-service");
const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);

let root;
dbConnector.connect().then(() => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSIONS_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
        submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk};
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection);
    const userService = new User(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.devTier);
    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, organizationService);
    const s3Service = new S3Service();
    const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
    const awsService = new AWSService(submissionCollection, userService);
    const batchService = new BatchService(s3Service, batchCollection, config.submission_bucket, config.sqs_loader_queue, awsService);

    const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
    const dataRecordService = new DataRecordService(dataRecordCollection, config.file_queue, config.metadata_queue, awsService);

    const submissionService = new Submission(logCollection, submissionCollection, batchService, userService, organizationService, notificationsService, dataRecordService, config.devTier);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, config.devTier);

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
        inquireApplication: dataInterface.inquireApplication.bind(dataInterface),
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: dataInterface.deleteApplication.bind(dataInterface),
        listApprovedStudies: approvedStudiesService.listApprovedStudiesAPI.bind(approvedStudiesService),
        listApprovedStudiesOfMyOrganization: approvedStudiesService.listApprovedStudiesOfMyOrganizationAPI.bind(approvedStudiesService),
        createBatch: submissionService.createBatch.bind(submissionService),
        updateBatch: submissionService.updateBatch.bind(submissionService),
        listBatches: submissionService.listBatches.bind(submissionService),
        createSubmission: submissionService.createSubmission.bind(submissionService),
        listSubmissions:  submissionService.listSubmissions.bind(submissionService),
        getSubmission:  submissionService.getSubmission.bind(submissionService),
        createTempCredentials: awsService.createTempCredentials.bind(awsService),
        submissionAction: submissionService.submissionAction.bind(submissionService),
        listLogs: submissionService.listLogs.bind(submissionService),
        // AuthZ
        getMyUser : userService.getMyUser.bind(userService),
        getUser : userService.getUser.bind(userService),
        updateMyUser : userService.updateMyUser.bind(userService),
        listUsers : userService.listUsers.bind(userService),
        editUser : userService.editUser.bind(userService),
        grantToken : userService.grantToken.bind(userService),
        listActiveCurators: userService.listActiveCuratorsAPI.bind(userService),
        listOrganizations : organizationService.listOrganizationsAPI.bind(organizationService),
        getOrganization : organizationService.getOrganizationAPI.bind(organizationService),
        editOrganization : organizationService.editOrganizationAPI.bind(organizationService),
        createOrganization : organizationService.createOrganizationAPI.bind(organizationService)
    };
});

const extractContext =(req) => {
    let context;
    let token = req.headers.authorization;
    if(token && token.split(' ').length > 1) {
        token = token.split(' ')[1];
        context = {"api-token":  token} ;
    }
    else context = req.session;
    if(!context) throw new Error(ERROR.INVALID_SESSION_OR_TOKEN);
    return context;
}

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: extractContext(req)
    })(req,res);
};
