const {Submission} = require("../../services/submission");
const {DataRecordService} = require("../../services/data-record-service");
const config = require("../../config");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {User} = require("../../crdc-datahub-database-drivers/services/user");
const {S3Service} = require("../../services/s3-service");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");

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
        aggregate: jest.fn(),
        name: 'MockModel'
    };

    return {
        user: mockPrismaModel,
        submission: mockPrismaModel,
        log: mockPrismaModel,
        dataRecord: mockPrismaModel,
        organization: mockPrismaModel
    };
});

jest.mock("../../crdc-datahub-database-drivers/services/user");
jest.mock("../../services/notify-user");

// Mock database service
const dbService = {
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 })
};

// Mock collections using Prisma models
const mockPrisma = require("../../prisma");
const userCollection = mockPrisma.user;
const logCollection = mockPrisma.log;
const testCollection = mockPrisma.organization;

const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const userService = new User(userCollection);
const submissionCollection = mockPrisma.submission;
const dataRecordCollection = mockPrisma.dataRecord;
const dataRecordService = new DataRecordService(dataRecordCollection, config.file_queue, config.metadata_queue, null);
const s3Service = new S3Service();
const organizationService = new Organization(testCollection);
const subInterface = new Submission(logCollection, submissionCollection, null, userService, organizationService, notificationsService, dataRecordService, "dev2", null, null, null, s3Service)

describe('Submission service test', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications no accessed submissions", async () => {
        submissionCollection.aggregate.mockImplementation(() => {
            return [];
        });
        await subInterface.deleteInactiveSubmissions();
        expect(dbService.updateMany).toBeCalledTimes(0);

    });
});