const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const ERROR = require("../../constants/error-constants");
const {updateApplication, logStateChange} = require("../../utility/application-util");
const {IN_PROGRESS, NEW} = require("../../constants/application-constants");
const applicationCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");

describe('update application tests', () => {
    let application = {
        _id: "test_id",
        status: IN_PROGRESS
    };
    let prevStatus = NEW;
    let userID = "my_user_id";

    test("update application returns null", async () => {
        applicationCollection.update.mockImplementation(() => {
            return null;
        });
        expect(updateApplication(applicationCollection, application, prevStatus, userID)).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND);
    });

    test("update application returns 0 matches", async () => {
        applicationCollection.update.mockImplementation(() => {
            return {matchedCount: 0};
        });
        expect(updateApplication(applicationCollection, application, prevStatus, userID)).rejects.toThrow(ERROR.APPLICATION_NOT_FOUND);
    });

    test("update application status change does not throw error", async () => {
        applicationCollection.update.mockImplementation((application, createHistoryEvent) => {
            return {matchedCount: 1};
        });
        expect(updateApplication(applicationCollection, application, prevStatus, userID)).resolves.not.toThrowError;
    });

    test("update application no status change does not throw error", async () => {
        prevStatus = IN_PROGRESS;
        applicationCollection.update.mockImplementation((application, createHistoryEvent) => {
            return {matchedCount: 1};
        });
        expect(updateApplication(applicationCollection, application, prevStatus, userID)).resolves.not.toThrowError;
    });
});

describe('log state change tests', () => {

    test("log state change does not throw error", async () => {
        logCollection.insert.mockImplementation(() => {
            return null;
        })
        expect(logStateChange(logCollection, {}, {}, NEW)).resolves.not.toThrowError;
    });
});
