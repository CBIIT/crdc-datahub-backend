jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock("../../crdc-datahub-database-drivers/services/user");

const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {EmailService} = require("../../services/email");
const config = require("../../config");
const {NotifyUser} = require("../../services/notify-user");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
const {S3Service} = require("../../crdc-datahub-database-drivers/services/s3-service");
const {User} = require("../../crdc-datahub-database-drivers/services/user");
const {AWSService} = require("../../services/aws-request");
const {BatchService} = require("../../services/batch-service");
const {DataRecordService} = require("../../services/data-record-service");
const {Submission} = require("../../services/submission");
const {TEST_SESSION} = require("../test-constants");
const ERROR = require("../../constants/error-constants");
const {USER} = require("../../crdc-datahub-database-drivers/constants/user-constants");
const {INTENTION, DATA_TYPE} = require("../../constants/submission-constants");
const applicationCollection = new MongoDBCollection();
const submissionCollection = new MongoDBCollection();
const userCollection = new MongoDBCollection();
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);
const emailParams = {url: config.emails_url, officialEmail: config.official_email, inactiveDays: config.inactive_application_days, remindDay: config.remind_application_days,
    submissionSystemPortal: config.submission_system_portal, submissionHelpdesk: config.submission_helpdesk, remindSubmissionDay: config.inactive_submission_days_notify};
const logCollection = new MongoDBCollection();
const organizationCollection = new MongoDBCollection();
const organizationService = new Organization(organizationCollection, userCollection, submissionCollection, applicationCollection);
const userService = new User(userCollection, logCollection, organizationCollection, notificationsService, submissionCollection, applicationCollection, config.official_email, config.tier);
const s3Service = new S3Service();
const batchCollection = new MongoDBCollection();
const awsService = new AWSService(submissionCollection, userService);
const batchService = new BatchService(s3Service, batchCollection, config.sqs_loader_queue, awsService);
const dataRecordCollection = new MongoDBCollection();
const dataRecordService = new DataRecordService(dataRecordCollection, config.file_queue, config.metadata_queue, awsService);
const dataModelInfo = {
    CDS: {
        "current-version": "1.0.0"
    }}
const submissionService = new Submission(logCollection, submissionCollection, batchService, userService, organizationService, notificationsService, dataRecordService, config.tier, dataModelInfo, awsService, config.export_queue, s3Service, emailParams, config.dataCommonsList);

// throw error if not allowed datacommon is attempted.
describe('createSubmission API test', () => {
    test("create submission", async () => {
        organizationCollection.aggregate.mockImplementation(() => {
            return [{name: "test", rootPath: "test", studies: [{studyAbbreviation: "test"}]}];
        });
        const allowedRole = USER.ROLES.SUBMITTER;
        const context = {userInfo: {...TEST_SESSION.userInfo, ...{role: allowedRole, organization: {orgName: "test"}}}}
        expect(submissionService.createSubmission({dataCommons: "TEST_DATA_COMMONS", intention: INTENTION.UPDATE, dataType: DATA_TYPE.METADATA_ONLY, name: "test", studyAbbreviation: "test"}, context)).rejects.toThrow(ERROR.CREATE_SUBMISSION_INVALID_DATA_COMMONS);
    });
});