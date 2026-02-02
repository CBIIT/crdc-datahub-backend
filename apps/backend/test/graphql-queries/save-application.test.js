const ERROR = require("../../constants/error-constants");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {v4} = require("uuid");
const {IN_PROGRESS} = require("../../constants/application-constants");

// Mock Prisma
jest.mock("../../prisma", () => {
    const mockPrismaModel = {
        create: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        name: 'MockModel'
    };

    return {
        application: mockPrismaModel,
        log: mockPrismaModel
    };
});

// Mock collections using Prisma models
const mockPrisma = require("../../prisma");
const applicationCollection = mockPrisma.application;
const logCollection = mockPrisma.log;
const dataInterface = new Application(logCollection, applicationCollection);

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
