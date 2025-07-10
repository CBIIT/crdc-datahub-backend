const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {ApprovedStudiesService} = require("../../services/approved-studies");
const {S3Service} = require("../../services/s3-service");
const {BatchService} = require("../../services/batch-service");
const ERROR = require("../../constants/error-constants");
const {Submission} = require("../../services/submission");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/mongo-queries.js");
const {UserService} = require("../../services/user");
jest.mock("../../services/notify-user");
const organizationService = new Organization(new MongoDBCollection());
const applicationCollection = new MongoDBCollection();
const approvedStudyService = new ApprovedStudiesService(new MongoDBCollection(), new MongoDBCollection(), organizationService);
const userCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const userService = new UserService(userCollection, null , null,null, null, null, null, null, organizationService);

const submissionCollection = new MongoDBCollection();
const submissionService = new Submission(submissionCollection);
const s3Service = new S3Service();
const batchCollection = new MongoDBCollection();
const batchService = new BatchService(s3Service, batchCollection, config.submission_bucket);
const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days};
const dataInterface = new Application(logCollection, applicationCollection, approvedStudyService, submissionService ,batchService, userService, dbService, notificationsService, emailParams);

describe('Batch Jobs test', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications no updated application", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [];
        });
        await dataInterface.deleteInactiveApplications();
        expect(dbService.updateMany).toBeCalledTimes(0);
        expect(notificationsService.inactiveApplicationsNotification).toBeCalledTimes(0);
    });

    test("deleteInactiveApplications undefined", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return undefined;
        });
        await expect(dataInterface.deleteInactiveApplications(1)).rejects.toThrow(ERROR.VERIFY.UNDEFINED_APPLICATION);

    });
});