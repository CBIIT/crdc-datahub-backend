const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dataInterface = new Application(applicationCollection);

describe('listApplication API test', () => {
    let params = {_id: TEST_APPLICATION._id};

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.listApplications(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.listApplications(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("list applications", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [];
        });
        expect(await dataInterface.listApplications(params, TEST_SESSION)).toStrictEqual([]);
        let result = [TEST_APPLICATION, TEST_APPLICATION];
        applicationCollection.aggregate.mockImplementation(() => {
            return result;
        });
        expect(await dataInterface.listApplications(params, TEST_SESSION)).toBe(result);
    });
});