const ERROR = require("../constants/error-constants");
const {MongoDBCollection} = require("../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../services/application");
const {IN_PROGRESS} = require("../constants/application-constants");
const {TEST_SESSION} = require("./test-constants");

jest.mock("../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const dataInterface = new Application(applicationCollection);

describe('saveApplication API test', () => {

    test("session errors", async () => {
        let session = {};
        expect(dataInterface.createApplication(params, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        session = {
            userInfo: {}
        };
        expect(dataInterface.createApplication(params, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });


});