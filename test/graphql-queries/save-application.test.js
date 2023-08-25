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
    // TODO
    // test("failed database operation", async () => {
    //     applicationCollection.update.mockImplementation(() => {
    //         throw new Error(ERROR.DATABASE_OPERATION_FAILED);
    //     });
    //     expect(dataInterface.saveApplication(params, TEST_SESSION)).rejects.toThrow(ERROR.DATABASE_OPERATION_FAILED);
    // });

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
    // TODO
    // test("save new application", async () => {
    //     applicationCollection.insert.mockImplementation(() => {
    //         return {};
    //     });
    //     const userInfo = TEST_SESSION.userInfo;
    //     let checkApplication = {
    //         ...TEST_APPLICATION,
    //         _id: v4(undefined, undefined, undefined),
    //         status: IN_PROGRESS,
    //         applicant: {
    //             applicantID: userInfo._id,
    //             applicantName: userInfo.firstName + " " + userInfo.lastName,
    //             applicantEmail: userInfo.email
    //         },
    //         createdAt: TEST_APPLICATION.updatedAt
    //     }
    //     params.application._id = null;
    //     const result = await dataInterface.saveApplication(params, TEST_SESSION);
    //     expect(result._id).toBeTruthy();
    //     checkApplication._id = result._id;
    //     expect(result).toStrictEqual(checkApplication);
    // })
});