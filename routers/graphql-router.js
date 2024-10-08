const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {Submission} = require("../services/submission");
const {AWSService} = require("../services/aws-request");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, SUBMISSIONS_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    APPROVED_STUDIES_COLLECTION, BATCH_COLLECTION,
    DATA_RECORDS_COLLECTION,
    INSTITUTION_COLLECTION,
    VALIDATION_COLLECTION,
    CONFIGURATION_COLLECTION
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
const {DataRecordService} = require("../services/data-record-service");
const {UtilityService} = require("../services/utility");
const {InstitutionService} = require("../services/institution-service");
const {DashboardService} = require("../services/dashboardService");
const UserInitializationService = require("../services/user-initialization-service");
const {ConfigurationService} = require("../services/configurationService");
const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);

let root;
dbConnector.connect().then(async () => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSIONS_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
        submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk, remindSubmissionDay: config.inactive_submission_days_notify};
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection, approvedStudiesCollection);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, organizationService);

    const userService = new User(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.tier, organizationService);
    const s3Service = new S3Service();
    const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
    const awsService = new AWSService(submissionCollection, userService);

    const utilityService = new UtilityService();
    const fetchDataModelInfo = async () => {
        return utilityService.fetchJsonFromUrl(config.model_url)
    };
    const dataModelInfo = await utilityService.fetchJsonFromUrl(config.model_url);

    const batchService = new BatchService(s3Service, batchCollection, config.sqs_loader_queue, awsService, config.prod_url, dataModelInfo);
    const institutionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, INSTITUTION_COLLECTION);
    const institutionService = new InstitutionService(institutionCollection);

    const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
    const dataRecordService = new DataRecordService(dataRecordCollection, config.file_queue, config.metadata_queue, awsService, s3Service);

    const validationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, VALIDATION_COLLECTION);
    const submissionService = new Submission(logCollection, submissionCollection, batchService, userService, organizationService, notificationsService, dataRecordService, config.tier, fetchDataModelInfo, awsService, config.export_queue, s3Service, emailParams, config.dataCommonsList, validationCollection, config.sqs_loader_queue);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, config.tier, institutionService);

    const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
    const configurationService = new ConfigurationService(configurationCollection)
    const dashboardService = new DashboardService(userService, awsService, configurationService, {dashboardUserID: config.dashboardUserID, dashboardID: config.dashboardID, sessionTimeout: config.dashboardSessionTimeout});
    const userInitializationService = new UserInitializationService(userCollection, organizationCollection);
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
        validateSubmission: submissionService.validateSubmission.bind(submissionService),
        submissionStats: submissionService.submissionStats.bind(submissionService),
        submissionQCResults: submissionService.submissionQCResults.bind(submissionService),
        submissionCrossValidationResults: submissionService.submissionCrossValidationResults.bind(submissionService),
        exportSubmission: submissionService.exportSubmission.bind(submissionService),
        listSubmissionNodeTypes: submissionService.listSubmissionNodeTypes.bind(submissionService),
        getSubmissionNodes: submissionService.listSubmissionNodes.bind(submissionService),
        getNodeDetail: submissionService.getNodeDetail.bind(submissionService),
        getRelatedNodes: submissionService.getRelatedNodes.bind(submissionService),
        retrieveCLIConfig: submissionService.getUploaderCLIConfigs.bind(submissionService),
        listInstitutions: institutionService.listInstitutions.bind(institutionService),
        // AuthZ
        getMyUser : userInitializationService.getMyUser.bind(userInitializationService),
        getUser : userService.getUser.bind(userService),
        updateMyUser : userService.updateMyUser.bind(userService),
        listUsers : userService.listUsers.bind(userService),
        editUser : userService.editUser.bind(userService),
        grantToken : userService.grantToken.bind(userService),
        listActiveCurators: userService.listActiveCuratorsAPI.bind(userService),
        listOrganizations : organizationService.listOrganizationsAPI.bind(organizationService),
        getOrganization : organizationService.getOrganizationAPI.bind(organizationService),
        editOrganization : organizationService.editOrganizationAPI.bind(organizationService),
        createOrganization : organizationService.createOrganizationAPI.bind(organizationService),
        deleteDataRecords: submissionService.deleteDataRecords.bind(submissionService),
        getDashboardURL: dashboardService.getDashboardURL.bind(dashboardService)
    };
});

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
