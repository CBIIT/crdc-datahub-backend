const ERROR = require("../constants/error-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../services/application");
const {IN_PROGRESS} = require("../constants/application-constants");
const {TEST_SESSION} = require("./test-constants");

jest.mock("../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dataInterface = new Application(applicationCollection);

describe('createApplication API test', () => {

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.createApplication({}, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.createApplication({}, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("failed database operation", async () => {
        applicationCollection.insert.mockImplementation(() => {
            throw new Error();
        });
        expect(dataInterface.createApplication({}, TEST_SESSION)).rejects.toThrow(ERROR.CREATE_APPLICATION_FAILED);
    })

    test("failed database operation", async () => {
        applicationCollection.insert.mockImplementation(() => {
            return {};
        });
        const result = await dataInterface.createApplication({}, TEST_SESSION);
        expect(typeof result._id).toBe("string")
        expect(result.status).toBe(IN_PROGRESS);
        expect(typeof result.createdAt).toBe("string")
        expect(result.applicantID).toBe(TEST_SESSION.userInfo.userID);
    });
});