const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");
const {DATABASE_NAME, APPLICATION_COLLECTION, USER_COLLECTION, ORGANIZATION_COLLECTION, LOG_COLLECTION,
    APPROVED_STUDIES_COLLECTION, BATCH_COLLECTION, SUBMISSION_COLLECTION
} = require("../crdc-datahub-database-drivers/database-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {EmailService} = require("../services/email");
const {NotifyUser} = require("../services/notify-user");
const {User} = require("../crdc-datahub-database-drivers/services/user");
const {ApprovedStudiesService} = require("../services/approved-studies");
const {BatchService} = require("../services/batch-service");
const {S3Service} = require("../crdc-datahub-database-drivers/services/s3-service");
const {SubmissionService} = require("../crdc-datahub-database-drivers/services/submission-service");
const {Organization} = require("../crdc-datahub-database-drivers/services/organization");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
let root;
dbConnector.connect().then(() => {
    const applicationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPLICATION_COLLECTION);
    const userCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, USER_COLLECTION);
    const emailService = new EmailService(config.email_transport, config.emails_enabled);
    const notificationsService = new NotifyUser(emailService);
    const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days};
    const logCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, LOG_COLLECTION);
    const userService = new User(userCollection, logCollection);

    const approvedStudiesCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, APPROVED_STUDIES_COLLECTION);
    const approvedStudiesService = new ApprovedStudiesService(approvedStudiesCollection);
    const submissionCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, SUBMISSION_COLLECTION);
    const submissionService = new SubmissionService(submissionCollection);
    const s3Service = new S3Service();
    const batchCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, BATCH_COLLECTION);
    const batchService = new BatchService(s3Service, batchCollection, config.submission_aws_bucket_name);

    const organizationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, ORGANIZATION_COLLECTION);
    const organizationService = new Organization(organizationCollection);
    const dataInterface = new Application(logCollection, applicationCollection, approvedStudiesService, submissionService, organizationService, batchService, userService, dbService, notificationsService, emailParams);
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
        createBatch: dataInterface.createBatch.bind(dataInterface),
    };
});



module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
