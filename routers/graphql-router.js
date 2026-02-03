const {createHandler} = require("graphql-http/lib/use/express");
const {assertValidSchema} = require("graphql");
const configuration = require("../config");

const {Application} = require("../services/application");
const {Submission} = require("../services/submission");
const {AWSService} = require("../services/aws-request");
const {CDE} = require("../services/CDEService");
const {TooltipService} = require("../services/tooltip-service");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, SUBMISSIONS_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    APPROVED_STUDIES_COLLECTION,
    DATA_RECORDS_COLLECTION,
    INSTITUTION_COLLECTION,
    VALIDATION_COLLECTION,
    CONFIGURATION_COLLECTION,
    CDE_COLLECTION,
    DATA_RECORDS_ARCHIVE_COLLECTION,
    QC_RESULTS_COLLECTION,
    RELEASE_DATA_RECORDS_COLLECTION,
    PENDING_PVS_COLLECTION
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
const typeDefs = require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8");
const dbService = new MongoQueries(configuration.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(configuration.mongo_db_connection_string);
const AuthenticationService = require("../services/authentication-service");
const {apiAuthorization, extractAPINames, PUBLIC} = require("./api-authorization");
const {QcResultService} = require("../services/qc-result-service");
const {UserService} = require("../services/user");
const sanitizeHtml = require("sanitize-html");
const {constraintDirective, constraintDirectiveTypeDefs} = require("graphql-constraint-directive");
const {makeExecutableSchema} = require("@graphql-tools/schema");
const ERROR = require("../constants/error-constants");
const {AuthorizationService} = require("../services/authorization-service");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const {ADMIN} = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {Release} = require("../services/release-service");
const DataModelService = require("../services/data-model-service");

// Create schema with constraint directive
const schema = constraintDirective()(
    makeExecutableSchema({
        typeDefs: [constraintDirectiveTypeDefs, typeDefs],
    })
);

// Validate schema at startup - throws if invalid (e.g., missing interface fields)
assertValidSchema(schema);

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
    const configurationService = new ConfigurationService();
    const authorizationService = new AuthorizationService(configurationService);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection, approvedStudiesCollection);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection, userCollection, organizationService, submissionCollection, authorizationService, notificationsService, {url: config.emails_url, contactEmail: config.conditionalSubmissionContact, submissionGuideURL: config.submissionGuideUrl});

    const institutionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, INSTITUTION_COLLECTION, userCollection);
    const institutionService = new InstitutionService(institutionCollection, authorizationService);
    const userService = new UserService(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.emails_url, approvedStudiesService, config.inactive_user_days, configurationService, institutionService, authorizationService);
    const s3Service = new S3Service();
    const awsService = new AWSService(configurationService);

    const utilityService = new UtilityService();
    const fetchDataModelInfo = async () => {
        return utilityService.fetchJsonFromUrl(config.model_url)
    };
    const batchService = new BatchService(s3Service, config.sqs_loader_queue, awsService, config.prod_url, fetchDataModelInfo);


    const qcResultCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, QC_RESULTS_COLLECTION);
    const qcResultsService = new QcResultService(qcResultCollection, submissionCollection, authorizationService);

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
        
    const uploadingMonitor = UploadingMonitor.getInstance(batchService.batchDAO, configurationService);

    const cdeService = new CDE();
    const tooltipService = new TooltipService();
    const dataModelService = new DataModelService(fetchDataModelInfo, config.model_url);
    const submissionService = new Submission(logCollection, submissionCollection, batchService, userService,
        organizationService, notificationsService, dataRecordService, fetchDataModelInfo, awsService, config.export_queue,
        s3Service, emailParams, config.dataCommonsList, config.hiddenModels, validationCollection, config.sqs_loader_queue, qcResultsService, config.uploaderCLIConfigs,
        config.submission_bucket, configurationService, uploadingMonitor, config.dataCommonsBucketMap, authorizationService, dataModelService, dataRecordCollection);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, userService, dbService, notificationsService, emailParams, organizationService, institutionService, configurationService, authorizationService);

    const dashboardService = new DashboardService(userService, awsService, configurationService, {sessionTimeout: config.dashboardSessionTimeout}, authorizationService);
    userInitializationService = new UserInitializationService(userCollection, organizationCollection, approvedStudiesCollection, configurationService);
    authenticationService = new AuthenticationService(userCollection);

    const releaseService = new Release(releaseCollection, authorizationService, dataModelService, s3Service, config);
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
            return await dataInterface.approveApplication({...params, comment}, context);
        },
        rejectApplication: async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return await dataInterface.rejectApplication({...params, comment}, context);
        },
        inquireApplication: async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            return await dataInterface.inquireApplication({...params, comment}, context);
        },
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        cancelApplication: async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            if (comment?.trim().length > 500) {
                throw new Error(ERROR.COMMENT_LIMIT);
            }

            return await dataInterface.cancelApplication({...params, comment}, context);
        },
        restoreApplication: async (params, context)=> {
            const comment = sanitizeHtml(params?.comment, {allowedTags: [],allowedAttributes: {}});
            if (comment?.trim().length > 500) {
                throw new Error(ERROR.COMMENT_LIMIT);
            }
            return await dataInterface.restoreApplication({...params, comment}, context);
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
            return await awsService.createTempCredentials(aSubmission.bucketName, aSubmission.rootPath);
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
        updateSubmissionInfo: submissionService.updateSubmissionInfo.bind(submissionService),
        editSubmission: submissionService.editSubmission.bind(submissionService),
        listInstitutions: institutionService.listInstitutions.bind(institutionService),
        updateInstitution: async (params, context) => {
            const aInstitution = await institutionService.updateInstitution(params, context);
            await userService.updateUserInstitution(aInstitution?._id, aInstitution?.name, aInstitution?.status);
            return aInstitution
        },
        getInstitution: institutionService.getInstitution.bind(institutionService),
        createInstitution: institutionService.createInstitution.bind(institutionService),

        // AuthZ
        getMyUser : userInitializationService.getMyUser.bind(userInitializationService),
        getUser : userService.getUser.bind(userService),
        updateMyUser : userService.updateMyUser.bind(userService),
        listUsers : userService.listUsers.bind(userService),
        editUser : userService.editUser.bind(userService),
        grantToken : userService.grantToken.bind(userService),
        listActiveDCPs: userService.listActiveDCPsAPI.bind(userService),
        listPrograms : organizationService.listPrograms.bind(organizationService),
        getOrganization : async (params, context) => {
            const userScope = await getOrgUserScope(authorizationService, context?.userInfo, ADMIN.MANAGE_PROGRAMS);
            if (userScope.isNoneScope()) {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
            return await organizationService.getOrganizationAPI(params, context);
        },
        editOrganization : async (params, context) => {
            const userScope = await getOrgUserScope(authorizationService, context?.userInfo, ADMIN.MANAGE_PROGRAMS);
            if (userScope.isNoneScope()) {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
            return await organizationService.editOrganizationAPI(params, context);
        },
        createOrganization : async (params, context) => {
            const userScope = await getOrgUserScope(authorizationService, context?.userInfo, ADMIN.MANAGE_PROGRAMS);
            if (userScope.isNoneScope()) {
                throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
            }
            return await organizationService.createOrganizationAPI(params, context);
        },
        deleteDataRecords: submissionService.deleteDataRecords.bind(submissionService),
        getDashboardURL: dashboardService.getDashboardURL.bind(dashboardService),
        retrieveCDEs: cdeService.getCDEs.bind(cdeService),
        editSubmissionCollaborators: submissionService.editSubmissionCollaborators.bind(submissionService),
        requestAccess: async (params, context)=> {
            const institutionName = sanitizeHtml(params?.institutionName, {allowedTags: [],allowedAttributes: {}});
            return await userService.requestAccess({...params, institutionName}, context);
        },
        retrievePBACDefaults: configurationService.getPBACDefaults.bind(configurationService),
        downloadMetadataFile: submissionService.getMetadataFile.bind(submissionService),
        retrieveCLIUploaderVersion: configurationService.retrieveCLIUploaderVersion.bind(configurationService),
        getApplicationFormVersion: configurationService.getApplicationFormVersion.bind(configurationService),
        userIsPrimaryContact: userService.isUserPrimaryContact.bind(userService),
        isMaintenanceMode: configurationService.isMaintenanceMode.bind(configurationService),
        getTooltips: tooltipService.getTooltips.bind(tooltipService),
        getSubmissionAttributes: submissionService.getSubmissionAttributes.bind(submissionService),
        listReleasedStudies: releaseService.listReleasedStudies.bind(releaseService),
        getReleaseNodeTypes: releaseService.getReleaseNodeTypes.bind(releaseService),
        getPendingPVs: submissionService.getPendingPVs.bind(submissionService),
        listReleasedDataRecords: releaseService.listReleasedDataRecords.bind(releaseService),
        retrievePropsForNodeType: releaseService.getPropsForNodeType.bind(releaseService),
        requestPV: async (params, context)=> {
            const fieldsToSanitize = ['comment', 'nodeName', 'property'];
            const sanitized = Object.fromEntries(
                fieldsToSanitize.map(field => [field, sanitizeHtml(params?.[field], { allowedTags: [], allowedAttributes: {} })])
            );
            return await submissionService.requestPV({...params, ...sanitized}, context);
        },
        downloadDBGaPLoadSheet: submissionService.downloadDBGaPLoadSheet.bind(submissionService),
        getOMB: configurationService.getOMB.bind(configurationService),
        downloadAllReleasedNodes: releaseService.downloadAllReleasedNodes.bind(releaseService),
        getSubmissionSummary: submissionService.getSubmissionSummary.bind(submissionService),
    };
});

async function getOrgUserScope(authorizationService, userInfo, permission) {
    if (!userInfo?.email || !userInfo?.IDP) {
        throw new Error(ERROR.NOT_LOGGED_IN);
    }
    const validScopes = await authorizationService.getPermissionScope(userInfo, permission);
    const userScope = UserScope.create(validScopes);
    // valid scopes; none, all, role/role:RoleScope
    const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope();
    if (!isValidUserScope) {
        console.warn(ERROR.INVALID_USER_SCOPE, permission);
        throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
    }
    return userScope;
}


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
