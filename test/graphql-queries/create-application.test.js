const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {IN_PROGRESS} = require("../../constants/application-constants");
const {TEST_SESSION} = require("../test-constants");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const dataInterface = new Application(applicationCollection, dbService, notificationsService, config.emails_url);

describe('createApplication API test', () => {
    let params = {};

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.createApplication(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.createApplication(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("create application", async () => {
        applicationCollection.insert.mockImplementation(() => {
            return {};
        });
        const result = await dataInterface.createApplication(params, TEST_SESSION);
        expect(typeof result._id).toBe("string")
        expect(result.status).toBe(IN_PROGRESS);
        expect(typeof result.createdAt).toBe("string")
        expect(result.applicantID).toBe(TEST_SESSION.userInfo._id);
    });
});