const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dataInterface = new Application(applicationCollection);

describe('saveApplication API test', () => {
    let params = {
        application: TEST_APPLICATION
    };

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.saveApplication(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.saveApplication(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("failed database operation", async () => {
        applicationCollection.update.mockImplementation(() => {
            throw new Error(ERROR.DATABASE_OPERATION_FAILED);
        });
        expect(dataInterface.saveApplication(params, TEST_SESSION)).rejects.toThrow(ERROR.DATABASE_OPERATION_FAILED);
    });

    test("application not found", async () => {
        applicationCollection.update.mockImplementation(() => {
            return {matchedCount: 0};
        });
        expect(dataInterface.saveApplication(params, TEST_SESSION)).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND+TEST_APPLICATION._id);
    })

    test("save application", async () => {
        applicationCollection.update.mockImplementation(() => {
            return {matchedCount: 1};
        });
        applicationCollection.find.mockImplementation(() => {
            return [TEST_APPLICATION];
        });
        expect(await dataInterface.saveApplication(params, TEST_SESSION)).toStrictEqual(TEST_APPLICATION);
    })
});