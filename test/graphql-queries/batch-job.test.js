const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_APPLICATION} = require("../test-constants");
const {MongoQueries} = require("../../crdc-datahub-database-drivers/mongo-queries");
const config = require("../../config");
const {DATABASE_NAME} = require("../../crdc-datahub-database-drivers/database-constants");
const ERROR = require("../../constants/error-constants");
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/mongo-queries.js");
const applicationCollection = new MongoDBCollection();
const dbService = new MongoQueries(config.mongo_db_connection_string, DATABASE_NAME);
const dataInterface = new Application(applicationCollection, dbService);

describe('Batch Jobs test', () => {
    test("deleteInactiveApplications updated applications", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [TEST_APPLICATION, TEST_APPLICATION];
        });
        dbService.updateMany.mockImplementation(()=>{
            return {modifiedCount: 1}
        })
        await dataInterface.deleteInactiveApplications(1);
        expect(dbService.updateMany).toBeCalledTimes(1);
    });

    test("deleteInactiveApplications no updated application", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return [];
        });
        await dataInterface.deleteInactiveApplications(1);
        expect(dbService.updateMany).toBeCalledTimes(0);
    });

    test("deleteInactiveApplications undefined", async () => {
        applicationCollection.aggregate.mockImplementation(() => {
            return undefined;
        });
        await expect(dataInterface.deleteInactiveApplications(1)).rejects.toThrow(ERROR.VERIFY.UNDEFINED_APPLICATION);

    });
});