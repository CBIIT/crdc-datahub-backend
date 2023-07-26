const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_APPLICATION} = require("../test-constants");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const ERROR = require("../../constants/error-constants");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {User} = require("../../crdc-datahub-authz/crdc-datahub-database-drivers/services/user");
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/mongo-queries.js");
const applicationCollection = new MongoDBCollection();
const userCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const dataInterface = new Application(applicationCollection, new User(userCollection), dbService, notificationsService, config.emails_url);

describe('Batch Jobs test', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications updated applications", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [TEST_APPLICATION, TEST_APPLICATION];
        });
        dbService.updateMany.mockImplementation(()=>{
            return {modifiedCount: 1}
        })
        await dataInterface.deleteInactiveApplications(1);
        expect(dbService.updateMany).toBeCalledTimes(1);
    });

    test("deleteInactiveApplications no updated application", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [];
        });
        await dataInterface.deleteInactiveApplications(1);
        expect(dbService.updateMany).toBeCalledTimes(0);
    });

    test("deleteInactiveApplications undefined", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return undefined;
        });
        await expect(dataInterface.deleteInactiveApplications(1)).rejects.toThrow(ERROR.VERIFY.UNDEFINED_APPLICATION);

    });
});