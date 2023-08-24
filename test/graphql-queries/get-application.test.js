const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dataInterface = new Application(logCollection,applicationCollection);

describe('getApplication API test', () => {
    let params = {_id: TEST_APPLICATION._id};

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.getApplication(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.getApplication(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("no matching applications", async () => {
        applicationCollection.find.mockImplementation(() => {
            return [];
        });
        expect(dataInterface.getApplication(params, TEST_SESSION)).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND+TEST_APPLICATION._id);
    });

    test("get application", async () => {
        applicationCollection.find.mockImplementation(() => {
            return [TEST_APPLICATION];
        });
        expect(await dataInterface.getApplication(params, TEST_SESSION)).toStrictEqual(TEST_APPLICATION);
    });
});