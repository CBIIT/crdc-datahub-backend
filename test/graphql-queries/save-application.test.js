const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {v4} = require("uuid");
const {IN_PROGRESS} = require("../../constants/application-constants");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dataInterface = new Application(logCollection,applicationCollection);

describe('saveApplication API test', () => {

    test("session validation failure", async () => {
        let session = {};
        expect(dataInterface.saveApplication({}, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.saveApplication({}, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });
});
