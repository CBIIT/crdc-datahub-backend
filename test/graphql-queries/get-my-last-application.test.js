const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {IN_PROGRESS} = require("../../constants/application-constants");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {getCurrentTimeYYYYMMDDSS} = require("../../utility/time-utility");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dataInterface = new Application(applicationCollection);

describe('getMyLastApplication API test', () => {
    let params = {};

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.getMyLastApplication(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.getMyLastApplication(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("no matching applications", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [];
        });
        expect(dataInterface.getMyLastApplication(params, TEST_SESSION)).rejects.toThrow(ERROR.NO_USER_APPLICATIONS);
    });
    let result = [TEST_APPLICATION, TEST_APPLICATION];
    test("get application", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return result;
        });
        expect(await dataInterface.getMyLastApplication(params, TEST_SESSION)).toStrictEqual(TEST_APPLICATION);
    });
});