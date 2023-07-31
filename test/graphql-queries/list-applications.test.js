const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {User} = require("../../crdc-datahub-database-drivers/services/user");
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/services/user");
const applicationCollection = new MongoDBCollection();

const userCollection = new MongoDBCollection();
const userService = new User(userCollection);
const dataInterface = new Application(applicationCollection, userService);

describe('listApplication API test', () => {
    let params = {_id: TEST_APPLICATION._id};
    afterEach(() => {
        jest.clearAllMocks();
        userService.isAdmin.mockImplementation(()=>{
            return false;
        });
    });

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
        expect(await dataInterface.listApplications(params, TEST_SESSION)).toStrictEqual({total: 0, applications: []});
        let result = {total: 2, applications: [TEST_APPLICATION, TEST_APPLICATION]};
        applicationCollection.aggregate.mockImplementation(() => {
            return [TEST_APPLICATION, TEST_APPLICATION];
        });
        expect(await dataInterface.listApplications(params, TEST_SESSION)).toStrictEqual(result);
    });
});