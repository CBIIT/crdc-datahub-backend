const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const configuration = require("../config");

const {Application} = require("../services/application");
const {Submission} = require("../services/submission");
const {AWSService} = require("../services/aws-request");
const {CDE} = require("../services/CDEService");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, SUBMISSIONS_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    APPROVED_STUDIES_COLLECTION, BATCH_COLLECTION,
    DATA_RECORDS_COLLECTION,
    INSTITUTION_COLLECTION,
    VALIDATION_COLLECTION,
    CONFIGURATION_COLLECTION,
    CDE_COLLECTION,
    DATA_RECORDS_ARCHIVE_COLLECTION,
    QC_RESULTS_COLLECTION,
    RELEASE_DATA_RECORDS_COLLECTION
} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");
const {ApprovedStudiesService} = require("../services/approved-studies");
const {BatchService, UploadingMonitor} = require("../services/batch-service");
const {S3Service} = require("../services/s3-service");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");
const {DataRecordService} = require("../services/data-record-service");
const {UtilityService} = require("../services/utility");
const {InstitutionService} = require("../services/institution-service");
const {DashboardService} = require("../services/dashboardService");
const UserInitializationService = require("../services/user-initialization-service");
const {ConfigurationService} = require("../services/configurationService");
const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(configuration.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(configuration.mongo_db_connection_string);
const AuthenticationService = require("../services/authentication-service");
const {apiAuthorization, extractAPINames, PUBLIC} = require("./api-authorization");
const {QcResultService} = require("../services/qc-result-service");
const {UserService} = require("../services/user");
const sanitizeHtml = require("sanitize-html");
const public_api_list = extractAPINames(schema, PUBLIC)
let root;
let authenticationService, userInitializationService;
dbConnector.connect().then(async () => {
    const config = await configuration.updateConfig(dbConnector);
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSIONS_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService, config.tier);

    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection, approvedStudiesCollection);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, userCollection, organizationService, submissionCollection);

    const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
    const configurationService = new ConfigurationService(configurationCollection)

    const institutionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, INSTITUTION_COLLECTION);
    const institutionService = new InstitutionService(institutionCollection);
    const userService = new UserService(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.emails_url, approvedStudiesService, config.inactive_user_days, configurationService, institutionService);
    const s3Service = new S3Service();
    const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
    const awsService = new AWSService();

    const utilityService = new UtilityService();
    const fetchDataModelInfo = async () => {
        return utilityService.fetchJsonFromUrl(config.model_url)
    };
    const batchService = new BatchService(s3Service, batchCollection, config.sqs_loader_queue, awsService, config.prod_url, fetchDataModelInfo);


    const qcResultCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, QC_RESULTS_COLLECTION);
    const qcResultsService = new QcResultService(qcResultCollection, submissionCollection);

    const releaseCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, RELEASE_DATA_RECORDS_COLLECTION);
    const dataRecordCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_COLLECTION);
    const dataRecordArchiveCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, DATA_RECORDS_ARCHIVE_COLLECTION);
    const dataRecordService = new DataRecordService(dataRecordCollection, dataRecordArchiveCollection, releaseCollection, config.file_queue, config.metadata_queue, awsService, s3Service, qcResultsService, config.export_queue);

    const validationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, VALIDATION_COLLECTION);

    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
        submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk, remindSubmissionDay: config.inactiveSubmissionNotifyDays,
        techSupportEmail: config.techSupportEmail, conditionalSubmissionContact: config.conditionalSubmissionContact, submissionGuideURL: config.submissionGuideUrl,
        completedSubmissionDays: config.completed_submission_days, inactiveSubmissionDays: config.inactive_submission_days, finalRemindSubmissionDay: config.inactive_submission_days,
        inactiveApplicationNotifyDays: config.inactiveApplicationNotifyDays};
        
    const uploadingMonitor = UploadingMonitor.getInstance(batchCollection, configurationService);
    const submissionService = new Submission(logCollection, submissionCollection, batchService, userService,
        organizationService, notificationsService, dataRecordService, fetchDataModelInfo, awsService, config.export_queue,
        s3Service, emailParams, config.dataCommonsList, config.hiddenModels, validationCollection, config.sqs_loader_queue, qcResultsService, config.uploaderCLIConfigs,
        config.submission_bucket, configurationService, uploadingMonitor);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, institutionService, configurationService);

    const dashboardService = new DashboardService(userService, awsService, configurationService, {sessionTimeout: config.dashboardSessionTimeout});
    userInitializationService = new UserInitializationService(userCollection, organizationCollection, approvedStudiesCollection, configurationService);
    authenticationService = new AuthenticationService(userCollection);
    
    const cdeCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CDE_COLLECTION);
    const cdeService = new CDE(cdeCollection);

    root = {
        version: () => {return config.version},
        saveApplication: dataInterface.saveApplication.bind(dataInterface),
        getApplication: dataInterface.getApplication.bind(dataInterface),
        reviewApplication: dataInterface.reviewApplication.bind(dataInterface),
        getMyLastApplication: dataInterface.getMyLastApplication.bind(dataInterface),
        listApplications: dataInterface.listApplications.bind(dataInterface),
        submitApplication: dataInterface.submitApplication.bind(dataInterface),
        approveApplication:  async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return dataInterface.approveApplication({...params, comment}, context);
        },
        rejectApplication: (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return dataInterface.rejectApplication({...params, comment}, context);
        },
        inquireApplication: async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return dataInterface.inquireApplication({...params, comment}, context);
        },
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return dataInterface.deleteApplication({...params, comment}, context);
        },
        restoreApplication: (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return dataInterface.restoreApplication({...params, comment}, context);
        },
        listApprovedStudies: approvedStudiesService.listApprovedStudiesAPI.bind(approvedStudiesService),
        createApprovedStudy: approvedStudiesService.addApprovedStudyAPI.bind(approvedStudiesService),
        updateApprovedStudy: approvedStudiesService.editApprovedStudyAPI.bind(approvedStudiesService),
        getApprovedStudy: approvedStudiesService.getApprovedStudyAPI.bind(approvedStudiesService),
        createBatch: submissionService.createBatch.bind(submissionService),
        updateBatch: submissionService.updateBatch.bind(submissionService),
        listBatches: submissionService.listBatches.bind(submissionService),
        createSubmission: submissionService.createSubmission.bind(submissionService),
        listSubmissions:  submissionService.listSubmissions.bind(submissionService),
        getSubmission:  submissionService.getSubmission.bind(submissionService),
        createTempCredentials: async (params, context)=> {
            const aSubmission = await submissionService.verifyTempCredential(params?.submissionID, context?.userInfo);
            return awsService.createTempCredentials(aSubmission.bucketName, aSubmission.rootPath);
        },
        submissionAction: submissionService.submissionAction.bind(submissionService),
        validateSubmission: submissionService.validateSubmission.bind(submissionService),
        submissionStats: submissionService.submissionStats.bind(submissionService),
        aggregatedSubmissionQCResults: qcResultsService.aggregatedSubmissionQCResultsAPI.bind(qcResultsService),
        submissionQCResults: qcResultsService.submissionQCResultsAPI.bind(qcResultsService),
        submissionCrossValidationResults: submissionService.submissionCrossValidationResults.bind(submissionService),
        listSubmissionNodeTypes: submissionService.listSubmissionNodeTypes.bind(submissionService),
        getSubmissionNodes: submissionService.listSubmissionNodes.bind(submissionService),
        getNodeDetail: submissionService.getNodeDetail.bind(submissionService),
        getRelatedNodes: submissionService.getRelatedNodes.bind(submissionService),
        retrieveCLIConfig: submissionService.getUploaderCLIConfigs.bind(submissionService),
        listPotentialCollaborators: submissionService.listPotentialCollaborators.bind(submissionService),
        retrieveFileNodeConfig: submissionService.getDataFileConfigs.bind(submissionService),
        retrieveReleasedDataByID: submissionService.getReleasedNodeByIDs.bind(submissionService),
        updateSubmissionModelVersion: submissionService.updateSubmissionModelVersion.bind(submissionService),
        listInstitutions: institutionService.listInstitutions.bind(institutionService),
        createInstitution: institutionService.createInstitution.bind(institutionService),
        // AuthZ
        getMyUser : userInitializationService.getMyUser.bind(userInitializationService),
        getUser : userService.getUser.bind(userService),
        updateMyUser : userService.updateMyUser.bind(userService),
        listUsers : userService.listUsers.bind(userService),
        editUser : userService.editUser.bind(userService),
        grantToken : userService.grantToken.bind(userService),
        listActiveDCPs: userService.listActiveDCPsAPI.bind(userService),
        listOrganizations : organizationService.listOrganizationsAPI.bind(organizationService),
        getOrganization : organizationService.getOrganizationAPI.bind(organizationService),
        editOrganization : organizationService.editOrganizationAPI.bind(organizationService),
        createOrganization : organizationService.createOrganizationAPI.bind(organizationService),
        deleteDataRecords: submissionService.deleteDataRecords.bind(submissionService),
        getDashboardURL: dashboardService.getDashboardURL.bind(dashboardService),
        retrieveCDEs: cdeService.getCDEs.bind(cdeService),
        editSubmissionCollaborators: submissionService.editSubmissionCollaborators.bind(submissionService),
        requestAccess: (params, context)=> {
            const institutionName = sanitizeHtml(params?.institutionName, {allowedTags: [],allowedAttributes: {}});
            return userService.requestAccess({...params, institutionName}, context);
        },
        retrievePBACDefaults: configurationService.getPBACDefaults.bind(configurationService),
        downloadMetadataFile: submissionService.getMetadataFile.bind(submissionService),
        retrieveCLIUploaderVersion: configurationService.retrieveCLIUploaderVersion.bind(configurationService),
    };
});


module.exports = (req, res, next) => {
    apiAuthorization(req, authenticationService, userInitializationService, public_api_list).then((authorized) => {
        createHandler({
            schema: schema,
            rootValue: root,
            context: req.session
        })(req,res);
    })
    .catch((error) => {
        next(error);
    })
};
