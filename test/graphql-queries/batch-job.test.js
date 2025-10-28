const {Application} = require("../../services/application");
const config = require("../../config");
const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const {ApprovedStudiesService} = require("../../services/approved-studies");
const {S3Service} = require("../../services/s3-service");
const {BatchService} = require("../../services/batch-service");
const {Submission} = require("../../services/submission");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
const ApplicationDAO = require("../../dao/application");

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
        user: mockPrismaModel,
        submission: mockPrismaModel,
        batch: mockPrismaModel,
        log: mockPrismaModel,
        configuration: mockPrismaModel,
        approvedStudies: mockPrismaModel,
        organization: mockPrismaModel,
        institution: mockPrismaModel,
        qcResult: mockPrismaModel,
        release: mockPrismaModel,
        dataRecord: mockPrismaModel,
        dataRecordArchive: mockPrismaModel,
        validation: mockPrismaModel
    };
});

jest.spyOn(ApplicationDAO.prototype, "aggregate").mockImplementation(() => []);
jest.spyOn(ApplicationDAO.prototype, "updateMany").mockImplementation(() => ({ matchedCount: 0, modifiedCount: 0 }));

const {UserService} = require("../../services/user");
jest.mock("../../services/notify-user");

// Mock organization service
const organizationService = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
};

// Mock collections using Prisma models
const mockPrisma = require("../../prisma");
const applicationCollection = mockPrisma.application;
const userCollection = mockPrisma.user;
const logCollection = mockPrisma.log;
const submissionCollection = mockPrisma.submission;
const batchCollection = mockPrisma.batch;

// Mock database service
const dbService = {
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 })
};

const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const userService = new UserService(userCollection, null, null, null, null, null, null, null, organizationService);

const submissionService = new Submission(logCollection, submissionCollection, null, null, organizationService);
const s3Service = new S3Service();

// Mock AWS service and fetchDataModelInfo for consistent BatchService constructor
const mockAwsService = {
    sendSQSMessage: jest.fn()
};

const mockFetchDataModelInfo = jest.fn().mockResolvedValue({
    'test-commons': {
        'omit-DCF-prefix': false
    }
});

const batchService = new BatchService(s3Service, config.sqs_loader_queue, mockAwsService, config.prod_url, mockFetchDataModelInfo);
const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days};
const dataInterface = new Application(logCollection, applicationCollection, null, submissionService, batchService, userService, dbService, notificationsService, emailParams, null, null, null, null);

describe('Batch Jobs test', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("deleteInactiveApplications no updated application", async () => {
        dbService.updateMany.mockReset();
        dbService.updateMany.mockResolvedValue({ modifiedCount: 0 });
        await dataInterface.deleteInactiveApplications(30); // use a valid days value
        expect(dbService.updateMany).toBeCalledTimes(0);
        expect(notificationsService.inactiveApplicationsNotification).toBeCalledTimes(0);
    });

    test("deleteInactiveApplications undefined", async () => {
        dbService.updateMany.mockReset();
        dbService.updateMany.mockResolvedValue({ modifiedCount: 0 });
        // Patch: expect resolved value to be undefined (not rejected)
        await expect(dataInterface.deleteInactiveApplications(30)).resolves.toBeUndefined();
    });
});