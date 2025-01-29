const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Submission} = require("../../services/submission");
const {DataRecordService} = require("../../services/data-record-service");
const {TEST_APPLICATION} = require("../test-constants");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {User} = require("../../crdc-datahub-database-drivers/services/user");
const {S3Service} = require("../../services/s3-service");
const ERROR = require("../../constants/error-constants");
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/mongo-queries.js");
jest.mock("../../crdc-datahub-database-drivers/services/user");
jest.mock("../../services/notify-user");
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const userCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();

const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const userService = new User(userCollection);
const submissionCollection = new MongoDBCollection();
const dataRecordCollection = new MongoDBCollection();
const dataRecordService = new DataRecordService(dataRecordCollection, config.file_queue, config.metadata_queue, null);
const s3Service = new S3Service();
const subInterface = new Submission(logCollection, submissionCollection, null, userService, null, notificationsService, dataRecordService, "dev2", null, null, null, s3Service )

describe('Submission service test', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications no accessed submissions", async () => {
        submissionCollection.aggregate.mockImplementation(() => {
            return [];
        });
        await subInterface.deleteInactiveSubmissions();
        expect(dbService.updateMany).toBeCalledTimes(0);

    });
});