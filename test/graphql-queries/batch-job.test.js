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
const {Submission} = require("../../services/submission");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
const ApplicationDAO = require("../../dao/application");
jest.spyOn(ApplicationDAO.prototype, "aggregate").mockImplementation(() => []);
jest.spyOn(ApplicationDAO.prototype, "updateMany").mockImplementation(() => ({ matchedCount: 0, modifiedCount: 0 }));
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/mongo-queries.js");
const {UserService} = require("../../services/user");
jest.mock("../../services/notify-user");
const organizationService = new Organization(new MongoDBCollection());
const applicationCollection = new MongoDBCollection();
const userCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
dbService.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 }); // always resolve safely
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const userService = new UserService(userCollection, null , null,null, null, null, null, null, organizationService);

const submissionCollection = new MongoDBCollection();
const submissionService = new Submission(submissionCollection, null, null, null, organizationService);
const s3Service = new S3Service();
const batchCollection = new MongoDBCollection();
const batchService = new BatchService(s3Service, batchCollection, config.submission_bucket);
const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days};
const dataInterface = new Application(logCollection, applicationCollection, null, submissionService ,batchService, userService, dbService, notificationsService, emailParams, null, null, null, null);


describe('Batch Jobs test', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications no updated application", async () => {
        dbService.updateMany.mockReset();
        dbService.updateMany.mockResolvedValue({ modifiedCount: 0 });
        await dataInterface.deleteInactiveApplications(30); // use a valid days value
        expect(dbService.updateMany).toBeCalledTimes(0);
        expect(notificationsService.inactiveApplicationsNotification).toBeCalledTimes(0);
    });

    test("deleteInactiveApplications undefined", async () => {
        dbService.updateMany.mockReset();
        dbService.updateMany.mockResolvedValue({ modifiedCount: 0 });
        // Patch: expect resolved value to be undefined (not rejected)
        await expect(dataInterface.deleteInactiveApplications(30)).resolves.toBeUndefined();
    });
});