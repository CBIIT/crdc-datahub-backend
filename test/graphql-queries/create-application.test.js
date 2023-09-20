const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {NEW} = require("../../constants/application-constants");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {application} = require("express");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const dataInterface = new Application(logCollection, applicationCollection, dbService, notificationsService, config.emails_url);

describe('createApplication API test', () => {

    test("create application", async () => {
        applicationCollection.insert.mockImplementation(() => {
            return {};
        });
        const userInfo = TEST_SESSION.userInfo;
        const result = await dataInterface.createApplication(TEST_APPLICATION, userInfo);
        expect(typeof result._id).toBe("string")
        expect(result.status).toBe(NEW);
        expect(result.createdAt).toBe(TEST_APPLICATION.updatedAt);
        expect(result.applicant.applicantID).toBe(userInfo._id);
        expect(result.applicant.applicantEmail).toBe(userInfo.email);
        expect(result.applicant.applicantName).toBe(userInfo.firstName+" "+userInfo.lastName);
    });
});