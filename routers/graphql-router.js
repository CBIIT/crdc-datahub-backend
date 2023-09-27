const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    BATCH_COLLECTION, APPROVED_STUDIES_COLLECTION
} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");
const {ApprovedStudiesService} = require("../services/approved-studies");
const {BatchService} = require("../services/batch-service");
const {S3Service} = require("../crdc-datahub-database-drivers/services/s3-service");
const {verifySession} = require("../verifier/user-info-verifier");
const {verifyBatch} = require("../verifier/batch-verifier");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
let root;
dbConnector.connect().then(() => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days};
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const userService = new User(userCollection, logCollection);

    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, new Organization(organizationCollection), userService, dbService, notificationsService, emailParams);
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
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: dataInterface.deleteApplication.bind(dataInterface),
        createBatch: async (params, context) => {
            verifySession(context)
                .verifyInitialized();
            verifyBatch(params)
                .isUndefined()
                .notEmpty()
                .type([BATCH.TYPE.METADATA, BATCH.TYPE.FILE])
            // Optional metadata intention
            if (params?.metadataIntention) {
                verifyBatch(params)
                    .metadataIntention([BATCH.INTENTION.NEW]);
            }
            await verifyBatchPermission(dataInterface, dbConnector, params.submissionID, context.userInfo);
            const s3Service = new S3Service();
            const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
            const batchService = new BatchService(s3Service, batchCollection, config.submission_aws_bucket_name);
            return await batchService.createBatch(params, context);
        },
        listBatches: async (params, context) => {
            verifySession(context)
                .verifyInitialized();

            // TODO permissions
            // submissionID
            const s3Service = new S3Service();
            const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
            const batchService = new BatchService(s3Service, batchCollection, config.submission_aws_bucket_name);
            return await batchService.listBatches(params, context);
        }
    };
});

const verifyBatchPermission= async(applicationService, dbConnector, submissionID, userInfo) => {
    const collectionNames = [ORGANIZATION_COLLECTION, LOG_COLLECTION, USER_COLLECTION];
    const collections = collectionNames.map(name => new MongoDBCollection(dbConnector.client, DATABASE_NAME, name));
    const [organizationCollection, logCollection, userCollection] = collections;
    const organizationService = new Organization(organizationCollection);
    const userService = new User(userCollection, logCollection);
    // verify submission owner
    const aApplication = await applicationService.getApplicationById(submissionID);
    const applicantUserID = aApplication.applicant.applicantID;
    const aUser = await userService.getUserByID(applicantUserID);
    if (isPermittedUser(aUser, userInfo)) {
        return;
    }
    // verify submission's organization owner
    const aOrganization = await organizationService.getOrganizationByID(aApplication.organization._id);
    const aOrgUser = await userService.getUserByID(aOrganization.owner);
    if (aOrganization && isPermittedUser(aOrgUser, userInfo)) {
        return;
    }
    throw new Error(ERROR.INVALID_BATCH_PERMISSION);
}

const isPermittedUser = (aTargetUser, userInfo) => {
    return aTargetUser?.email === userInfo.email && aTargetUser?.IDP === userInfo.IDP
}


module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
