//
// const { Submission } = require("../../services/submission");
// const { INTENTION, DATA_TYPE,
//     NEW,
//     COLLABORATOR_PERMISSIONS,
//     IN_PROGRESS,
//     SUBMITTED,
//     RELEASED,
//     ARCHIVED,
//     REJECTED,
//     WITHDRAWN
// } = require("../../constants/submission-constants");
// const ERROR = require("../../constants/error-constants");
// const {USER} = require("../../crdc-datahub-database-drivers/constants/user-constants");
// const ROLES = USER.ROLES;
// const USER_PERMISSION_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");
// const {MODEL_NAME: USER_CONSTANTS} = require("../../constants/db-constants");
// const {replaceErrorString} = require("../../utility/string-util");
// const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
// const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
// const {ValidationHandler} = require("../../utility/validation-handler");
// const {ROLE} = require("../../constants/permission-scope-constants");
//
//
//
//
// jest.mock('../../dao/submission');
// jest.mock('../../dao/program');
// jest.mock('../../utility/string-util');
// jest.mock('../../utility/data-commons-remapper');
// jest.mock('../../dao/user');
//
// jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
// jest.mock('../../verifier/user-info-verifier', () => ({
//     verifySession: jest.fn(() => ({
//         verifyInitialized: jest.fn()
//     }))
// }));
//
//
// describe("Submission.createSubmission", () => {
//     let submissionService;
//     let mockSubmissionDAO, mockUserService, mockOrganizationService;
//     let mockContext, mockParams, mockApprovedStudy, mockProgram;
//
//     beforeEach(() => {
//         mockSubmissionDAO = {
//             create: jest.fn(),
//             findMany: jest.fn(),
//         };
//         mockUserService = {
//             getUserByID: jest.fn(),
//         };
//         mockOrganizationService = {
//             findOneByStudyID: jest.fn(),
//         };
//
//         // The correct order and type of arguments for Submission constructor
//         // See Submission.js for the correct signature
//         submissionService = new Submission(
//             { insert: jest.fn() }, // logCollection
//             mockSubmissionDAO, // submissionCollection
//             {}, // batchService
//             mockUserService, // userService
//             mockOrganizationService, // organizationService
//             {}, // notificationService
//             {}, // dataRecordService
//             jest.fn(), // fetchDataModelInfo
//             {}, // awsService
//             {}, // metadataQueueName
//             {}, // s3Service
//             {}, // emailParams
//             ["commonsA"], // dataCommonsList
//             [], // hiddenDataCommonsList
//             {}, // validationCollection
//             {}, // sqsLoaderQueue
//             {}, // qcResultsService
//             {}, // uploaderCLIConfigs
//             {}, // submissionBucketName
//             {}, // configurationService
//             {}, // uploadingMonitor
//             {}, // dataCommonsBucketMap
//             {}, // authorizationService
//             {}, // dataModelService
//         );
//
//         // Set up allowed/hidden data commons for validation
//         submissionService.allowedDataCommons = new Set(["commonsA"]);
//         submissionService.hiddenDataCommons = new Set();
//
//         // Mock user context
//         mockContext = {
//             userInfo: {
//                 _id: "user1",
//                 firstName: "Test",
//                 lastName: "User",
//                 email: "test@user.com",
//                 role: "Submitter"
//             }
//         };
//
//         // Mock params for a valid submission
//         mockParams = {
//             name: "Test Submission",
//             studyID: "study123",
//             dataCommons: "commonsA",
//             intention: INTENTION.UPDATE,
//             dataType: DATA_TYPE.METADATA_AND_DATA_FILES
//         };
//
//         mockApprovedStudy = {
//             _id: "study123",
//             dbGaPID: "dbgap-123",
//             controlledAccess: false,
//             pendingModelChange: false,
//         };
//
//         mockProgram = {
//             _id: "program1"
//         };
//
//         // Mock _getUserScope to always allow
//         submissionService._getUserScope = jest.fn().mockResolvedValue({
//             isNoneScope: () => false
//         });
//
//         // Mock fetchDataModelInfo and _getModelVersion
//         submissionService.fetchDataModelInfo = jest.fn().mockResolvedValue([{ version: "v1" }]);
//         submissionService._getModelVersion = jest.fn().mockReturnValue("v1");
//
//         // Mock _findApprovedStudies
//         submissionService._findApprovedStudies = jest.fn().mockResolvedValue([mockApprovedStudy]);
//
//         // Mock organizationService.findOneByStudyID
//         mockOrganizationService.findOneByStudyID.mockResolvedValue(mockProgram);
//
//         // Mock userService.getUserByID
//         mockUserService.getUserByID.mockResolvedValue({ firstName: "Contact", lastName: "Person", email: "contact@person.com" });
//
//         // Mock submissionDAO.create to return a submission object
//         mockSubmissionDAO.create.mockImplementation((submission) => {
//             return { ...submission, _id: "submission1" };
//         });
//
//         // Mock _remindPrimaryContactEmail to resolve
//         submissionService._remindPrimaryContactEmail = jest.fn().mockResolvedValue();
//
//         // Mock _findByID to return the created submission
//         submissionService._findByID = jest.fn().mockResolvedValue({ _id: "submission1", ...mockParams });
//
//         // Patch global.ERROR if not present
//         if (!global.ERROR) {
//             global.ERROR = ERROR;
//         }
//     });
//
//     it("should throw error if submission intention is invalid", async () => {
//         // Provide an invalid intention
//         const invalidParams = { ...mockParams, intention: "invalid_intention" };
//         await expect(submissionService.createSubmission(invalidParams, mockContext))
//             .rejects
//             .toThrow(ERROR.CREATE_SUBMISSION_INVALID_INTENTION);
//     });
//
//     it("should throw error if user does not have permission", async () => {
//         submissionService._getUserScope.mockResolvedValueOnce({
//             isNoneScope: () => true
//         });
//         await expect(submissionService.createSubmission(mockParams, mockContext))
//             .rejects
//             .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
//     });
//
//     it("should throw error if no approved study found", async () => {
//         // Simulate valid intention and dataType to avoid intention/dataType errors
//         submissionService._findApprovedStudies.mockResolvedValueOnce([]);
//         await expect(submissionService.createSubmission(mockParams, mockContext))
//             .rejects
//             .toThrow(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
//     });
//
//     it("should throw error if no associated program found", async () => {
//         // Simulate valid intention and dataType to avoid intention/dataType errors
//         submissionService._findApprovedStudies.mockResolvedValueOnce([mockApprovedStudy]);
//         mockOrganizationService.findOneByStudyID.mockResolvedValueOnce(null);
//         await expect(submissionService.createSubmission(mockParams, mockContext))
//             .rejects
//             .toThrow(ERROR.CREATE_SUBMISSION_NO_ASSOCIATED_PROGRAM);
//     });
//
//     it("should throw error if approved study is controlled access but missing dbGaPID", async () => {
//         // Simulate valid intention and dataType to avoid intention/dataType errors
//         submissionService._findApprovedStudies.mockResolvedValueOnce([
//             { ...mockApprovedStudy, controlledAccess: true, dbGaPID: null }
//         ]);
//         await expect(submissionService.createSubmission(mockParams, mockContext))
//             .rejects
//             .toThrow(ERROR.MISSING_CREATE_SUBMISSION_DBGAPID);
//     });
//
//     it("should throw error if approved study has pending model change", async () => {
//         // Simulate valid intention and dataType to avoid intention/dataType errors
//         submissionService._findApprovedStudies.mockResolvedValueOnce([
//             { ...mockApprovedStudy, pendingModelChange: true }
//         ]);
//         await expect(submissionService.createSubmission(mockParams, mockContext))
//             .rejects
//             .toThrow(ERROR.PENDING_APPROVED_STUDY);
//     });
// });
//
// describe('Submission.getSubmission', () => {
//     let submission;
//     let mockSubmissionDAO;
//     let mockUserDAO;
//     let mockProgramDAO;
//     let mockDataRecordService;
//     let mockUserService;
//     let mockS3Service;
//     let mockContext;
//     let mockSubmission;
//     let mockUser;
//
//     beforeEach(() => {
//         mockSubmission = {
//             _id: 'sub1',
//             submitterID: 'user1',
//             studyID: 'study1',
//             status: 'NEW',
//             bucketName: 'test-bucket',
//             rootPath: 'test/root',
//             programID: 'program1',
//             dataFileSize: { size: 1000, formatted: '1KB' },
//             nodeCount: 5,
//             history: [
//                 { userID: 'user1', action: 'created' },
//                 { userID: 'user2', action: 'updated' }
//             ],
//             archived: false
//         };
//
//         mockUser = {
//             _id: 'user1',
//             firstName: 'John',
//             lastName: 'Doe',
//             role: ROLES.SUBMITTER
//         };
//
//         mockSubmissionDAO = {
//             findById: jest.fn(),
//             update: jest.fn(),
//             findMany: jest.fn()
//         };
//
//         mockUserDAO = {
//             findFirst: jest.fn()
//         };
//
//         mockProgramDAO = {
//             findById: jest.fn()
//         };
//
//         mockDataRecordService = {
//             countNodesBySubmissionID: jest.fn()
//         };
//
//         mockUserService = {
//             getUserByID: jest.fn()
//         };
//
//         mockS3Service = {
//             listFile: jest.fn()
//         };
//
//         // Mock all required dependencies for Submission constructor
//         const mockOrganizationService = {
//             organizationCollection: jest.fn()
//         };
//
//         submission = new Submission(
//             jest.fn(), // logCollection
//             jest.fn(), // submissionCollection
//             jest.fn(), // batchService
//             mockUserService, // userService
//             mockOrganizationService, // organizationService
//             jest.fn(), // notificationService
//             mockDataRecordService, // dataRecordService
//             jest.fn(), // fetchDataModelInfo
//             jest.fn(), // awsService
//             jest.fn(), // metadataQueueName
//             mockS3Service, // s3Service
//             { remindSubmissionDay: 30 }, // emailParams
//             [], // dataCommonsList
//             [], // hiddenDataCommonsList
//             jest.fn(), // validationCollection
//             jest.fn(), // sqsLoaderQueue
//             jest.fn(), // qcResultsService
//             jest.fn(), // uploaderCLIConfigs
//             jest.fn(), // submissionBucketName
//             jest.fn(), // configurationService
//             jest.fn(), // uploadingMonitor
//             jest.fn(), // dataCommonsBucketMap
//             jest.fn(), // authorizationService
//             jest.fn() // dataModelService
//         );
//
//         // Override the DAOs with our mocks
//         submission.submissionDAO = mockSubmissionDAO;
//         submission.userDAO = mockUserDAO;
//         submission.programDAO = mockProgramDAO;
//         submission._findByID = jest.fn();
//         submission._getUserScope = jest.fn();
//         submission._getS3DirectorySize = jest.fn();
//         submission._getEveryReminderQuery = jest.fn();
//
//         global.verifySession = jest.fn(() => ({
//             verifyInitialized: jest.fn()
//         }));
//
//         global.ERROR = {
//             INVALID_SUBMISSION_NOT_FOUND: 'Cant find the submission by submissionID',
//             VERIFY: {
//                 INVALID_PERMISSION: 'Invalid permission'
//             },
//             FAILED_RECORD_FILESIZE_PROPERTY: 'Failed to record file size property'
//         };
//
//         mockContext = {
//             userInfo: {
//                 _id: 'user1',
//                 role: ROLES.SUBMITTER
//             }
//         };
//     });
//
//     it('should successfully get submission with all updates', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//         const mockDataFileSize = { size: 2000, formatted: '2KB' };
//         const mockOtherSubmissions = [
//             { _id: 'sub2', status: IN_PROGRESS },
//             { _id: 'sub3', status: SUBMITTED }
//         ];
//         const mockNodeCount = 10;
//         const mockUser1 = { firstName: 'John', lastName: 'Doe' };
//         const mockUser2 = { firstName: 'Jane', lastName: 'Smith' };
//         const mockProgram = { _id: 'program1', name: 'Test Program' };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({ remindInactiveSubmission: true });
//
//         mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
//         mockSubmissionDAO.findMany.mockResolvedValue(mockOtherSubmissions);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(mockNodeCount);
//         mockUserService.getUserByID
//             .mockResolvedValueOnce(mockUser1)
//             .mockResolvedValueOnce(mockUser2);
//         mockProgramDAO.findById.mockResolvedValue(mockProgram);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(submission._findByID).toHaveBeenCalledWith('sub1');
//         expect(submission._getUserScope).toHaveBeenCalledWith(
//             mockContext.userInfo,
//             USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW,
//             mockSubmission
//         );
//         expect(submission._getS3DirectorySize).toHaveBeenCalledWith('test-bucket', 'test/root/file/');
//         expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
//             dataFileSize: mockDataFileSize,
//             updatedAt: expect.any(Date)
//         });
//         expect(mockSubmissionDAO.findMany).toHaveBeenCalledWith({
//             studyID: 'study1',
//             status: {
//                 in: [IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN],
//             },
//             NOT: {
//                 id: 'sub1',
//             },
//         });
//         expect(mockDataRecordService.countNodesBySubmissionID).toHaveBeenCalledWith('sub1');
//         expect(mockUserService.getUserByID).toHaveBeenCalledTimes(2);
//         expect(mockProgramDAO.findById).toHaveBeenCalledWith('program1');
//         expect(result).toBeDefined();
//     });
//
//     it('should throw error when submission not found', async () => {
//         const params = { _id: 'sub1' };
//
//         submission._findByID = jest.fn().mockResolvedValue(null);
//
//         await expect(submission.getSubmission(params, mockContext))
//             .rejects
//             .toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
//     });
//
//     it('should throw error when user has no permission', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => true };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//
//         await expect(submission.getSubmission(params, mockContext))
//             .rejects
//             .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
//     });
//
//     it('should handle submission without study ID', async () => {
//         const params = { _id: 'sub1' };
//         const submissionWithoutStudy = { ...mockSubmission, studyID: null };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(submissionWithoutStudy);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(submissionWithoutStudy);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithoutStudy);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockSubmissionDAO.findMany).not.toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle archived submission', async () => {
//         const params = { _id: 'sub1' };
//         const archivedSubmission = { ...mockSubmission, archived: true };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(archivedSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(archivedSubmission);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(archivedSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockDataRecordService.countNodesBySubmissionID).not.toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle submission without program ID', async () => {
//         const params = { _id: 'sub1' };
//         const submissionWithoutProgram = { ...mockSubmission, programID: null };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(submissionWithoutProgram);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(submissionWithoutProgram);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithoutProgram);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockProgramDAO.findById).not.toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle data file size update failure', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//         const mockDataFileSize = { size: 2000, formatted: '2KB' };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(null);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//
//         await expect(submission.getSubmission(params, mockContext))
//             .rejects
//             .toThrow('Failed to record the file size property for a submission');
//     });
//
//     it('should handle node count update failure', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//         const mockDataFileSize = { size: 1000, formatted: '1KB' };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update
//             .mockResolvedValueOnce(mockSubmission) // First call for dataFileSize update
//             .mockResolvedValueOnce(null); // Second call for nodeCount update
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(10);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         // Should not throw error for node count update failure, just log
//         expect(result).toBeDefined();
//     });
//
//     it('should handle history with missing user information', async () => {
//         const params = { _id: 'sub1' };
//         const submissionWithHistory = {
//             ...mockSubmission,
//             history: [
//                 { userID: 'user1', action: 'created' },
//                 { action: 'updated' }, // No userID
//                 { userID: 'user2', userName: 'Jane Smith', action: 'modified' } // Already has userName
//             ]
//         };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(submissionWithHistory);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(submissionWithHistory);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//         mockUserService.getUserByID.mockResolvedValue({ firstName: 'John', lastName: 'Doe' });
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithHistory);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockUserService.getUserByID).toHaveBeenCalledWith('user1');
//         expect(result).toBeDefined();
//     });
//
//     it('should handle non-submitter user', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//         const nonSubmitterContext = {
//             userInfo: {
//                 _id: 'user2',
//                 role: 'ADMIN'
//             }
//         };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 2000, formatted: '2KB' }); // Different size to trigger update
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, nonSubmitterContext);
//
//         // For non-submitter users, the update should still be called for dataFileSize
//         expect(mockSubmissionDAO.update).toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle submitter user with accessedAt update', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({ remindInactiveSubmission: true });
//
//         mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
//             accessedAt: expect.any(Date),
//             remindInactiveSubmission: true
//         });
//         expect(result).toBeDefined();
//     });
//
//     it('should handle submission with no data file size change', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//         const mockDataFileSize = { size: 1000, formatted: '1KB' }; // Same as existing
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith('sub1', {
//             dataFileSize: mockDataFileSize,
//             updatedAt: expect.any(Date)
//         });
//         expect(result).toBeDefined();
//     });
//
//     it('should handle submission with no node count change', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5); // Same as existing
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith('sub1', {
//             updatedAt: expect.any(Date),
//             nodeCount: 5
//         });
//         expect(result).toBeDefined();
//     });
//
//     it('should handle submission with organization already set', async () => {
//         const params = { _id: 'sub1' };
//         const submissionWithOrg = {
//             ...mockSubmission,
//             organization: { _id: 'org1', name: 'Test Organization' }
//         };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(submissionWithOrg);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithOrg);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockProgramDAO.findById).not.toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle empty history array', async () => {
//         const params = { _id: 'sub1' };
//         const submissionWithEmptyHistory = { ...mockSubmission, history: [] };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(submissionWithEmptyHistory);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithEmptyHistory);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(mockUserService.getUserByID).not.toHaveBeenCalled();
//         expect(result).toBeDefined();
//     });
//
//     it('should handle user service returning null for history user', async () => {
//         const params = { _id: 'sub1' };
//         const mockUserScope = { isNoneScope: () => false };
//
//         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
//         submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
//         submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
//         submission._getEveryReminderQuery = jest.fn().mockReturnValue({});
//
//         mockSubmissionDAO.findMany.mockResolvedValue([]);
//         mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
//         mockUserService.getUserByID.mockResolvedValue(null);
//
//         const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
//         getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);
//
//         const result = await submission.getSubmission(params, mockContext);
//
//         expect(result).toBeDefined();
//         // History should remain unchanged when user is not found
//         expect(mockSubmission.history[0].userName).toBeUndefined();
//     });
// });
//
// describe('Submission.getPendingPVs', () => {
//     let service;
//     let context;
//     let mockSubmission;
//     let mockScope;
//     let mockAggregate;
//
//     beforeEach(() => {
//         mockAggregate = jest.fn().mockResolvedValue([{ _id: 'sub1' }]);
//         const mockSubmissionCollection = {
//             aggregate: mockAggregate
//         };
//
//         const organizationService = new Organization(new MongoDBCollection());
//
//         // Instantiate Submission with mocked submissionCollection
//         service = new Submission(
//             null,                   // logCollection
//             mockSubmissionCollection, // 👈 mocked collection
//             null, null, organizationService, null,
//             null, null, null, null,
//             null, null, [], [],    // dataCommonsList, hiddenDataCommonsList
//             null, null, null, null,
//             'bucket', null, null, {}, null, // submissionBucketName, configService, monitor, bucketMap, authService, dataModelService
//             {
//                 getDataModelByDataCommonAndVersion: jest.fn().mockResolvedValue({
//                     terms_: {
//                         age: 'Age',
//                         Age: 'Age'
//                     }
//                 })
//             }
//         );
//
//         // Mock dependencies
//         service.pendingPVDAO = {
//             findBySubmissionID: jest.fn(),
//             insertOne: jest.fn()
//         };
//
//         service.userService = {
//             getUsersByNotifications: jest.fn()
//         };
//
//         service.notificationService = {
//             requestPVNotification: jest.fn()
//         };
//
//         service._getUserScope = jest.fn();
//         service._isCollaborator = jest.fn();
//
//         // Mock context and permission scope
//         context = {
//             userInfo: { _id: 'user1' }
//         };
//
//         mockSubmission = {
//             _id: 'sub1',
//             ownerID: 'user1',
//             studyID: 'study123',
//             organization: { _id: 'org1', name: 'Org Name', abbreviation: 'ORG' }
//         };
//         service._findByID = jest.fn().mockResolvedValue(mockSubmission);
//
//         mockScope = {
//             isNoneScope: jest.fn().mockReturnValue(false),
//         };
//     });
//
//     it('returns pending PVs when user has permission', async () => {
//         service._getUserScope.mockResolvedValue(mockScope);
//         service._isCollaborator.mockReturnValue(true);
//         service.pendingPVDAO.findBySubmissionID.mockResolvedValue([
//             { property: 'age', value: 'unknown' }
//         ]);
//
//         const result = await service.getPendingPVs({ submissionID: 'sub1' }, context);
//
//         expect(result).toEqual([{ property: 'age', value: 'unknown' }]);
//         expect(service._findByID).toHaveBeenCalledWith('sub1');
//     });
//
//     it('throws error if submission is not found', async () => {
//         service._findByID.mockResolvedValue(null);
//         await expect(
//             service.getPendingPVs({ submissionID: 'sub1' }, context)
//         ).rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
//     });
//
//     it('throws error if user is not permitted', async () => {
//         mockAggregate.mockResolvedValue([mockSubmission]);
//         service._getUserScope.mockResolvedValue({
//             isNoneScope: () => true
//         });
//         service._isCollaborator.mockReturnValue(false);
//
//         await expect(
//             service.getPendingPVs({ submissionID: 'sub1' }, context)
//         ).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
//     });
//
//     it('successfully sends PV request', async () => {
//         service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
//         service._isCollaborator.mockReturnValue(true);
//         service.userService.getUsersByNotifications.mockResolvedValue([
//             { email: 'dc1@example.com', role: 'Data Commons Personnel' },
//             { email: 'admin@example.com', role: 'ADMIN' }
//         ]);
//         service.pendingPVDAO.findBySubmissionID.mockResolvedValue([]);
//         service.pendingPVDAO.insertOne.mockResolvedValue(true);
//         service.notificationService.requestPVNotification.mockResolvedValue({ accepted: ['dc1@example.com'] });
//
//         jest.spyOn(ValidationHandler, 'success').mockReturnValue(new ValidationHandler(true));
//
//         const result = await service.requestPV({
//             submissionID: 'sub1',
//             property: 'age',
//             value: 'unknown',
//             nodeName: 'Person',
//             comment: 'Test comment'
//         }, context);
//
//         expect(result.success).toBe(true);
//         expect(service.pendingPVDAO.insertOne).toHaveBeenCalledWith('sub1', 'age', 'unknown');
//         expect(service.notificationService.requestPVNotification).toHaveBeenCalled();
//     });
//
//     it('throws if property is empty', async () => {
//         await expect(service.requestPV({
//             submissionID: 'sub1',
//             property: '   ',
//             value: 'value'
//         }, context)).rejects.toThrow(ERROR.EMPTY_PROPERTY_REQUEST_PV);
//     });
//
//     it('throws if user is not permitted', async () => {
//         service._getUserScope.mockResolvedValue({ isNoneScope: () => true });
//         service._isCollaborator.mockReturnValue(false);
//
//         await expect(service.requestPV({
//             submissionID: 'sub1',
//             property: 'age',
//             value: 'unknown'
//         }, context)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
//     });
//
//     it('handles no recipients found', async () => {
//         service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
//         service._isCollaborator.mockReturnValue(true);
//         service.userService.getUsersByNotifications.mockResolvedValue([
//             { email: 'nondc@example.com', role: 'ADMIN' }
//         ]);
//
//         jest.spyOn(ValidationHandler, 'handle').mockReturnValue(new ValidationHandler(false, 'NO_RECIPIENT_PV_REQUEST'));
//
//         const result = await service.requestPV({
//             submissionID: 'sub1',
//             property: 'age',
//             value: 'unknown'
//         }, context);
//
//         expect(result.success).toBe(false);
//         expect(result.message).toContain('NO_RECIPIENT_PV_REQUEST');
//     });
//
//     it('throws if insertOne fails', async () => {
//         service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
//         service._isCollaborator.mockReturnValue(true);
//         service.userService.getUsersByNotifications.mockResolvedValue([
//             { email: 'dc1@example.com', role: 'Data Commons Personnel' },
//             { email: 'admin@example.com', role: 'ADMIN' }
//         ]);
//         service.pendingPVDAO.insertOne.mockResolvedValue(null);
//
//         await expect(service.requestPV({
//             submissionID: 'sub1',
//             property: 'age',
//             value: 'unknown'
//         }, context)).rejects.toThrow(replaceErrorString(ERROR.FAILED_TO_INSERT_REQUEST_PV, `submissionID: sub1, property: age, value: unknown`));
//     });
//
//     it('handles failed email send', async () => {
//         service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
//         service._isCollaborator.mockReturnValue(true);
//         service.userService.getUsersByNotifications.mockResolvedValue([
//             { email: 'dc@example.com', role: ROLE.DATA_COMMONS_PERSONNEL },
//         ]);
//         service.pendingPVDAO.insertOne.mockResolvedValue(true);
//         service.notificationService.requestPVNotification.mockResolvedValue({ accepted: [] });
//
//         jest.spyOn(ValidationHandler, 'handle').mockReturnValue(new ValidationHandler(false, 'FAILED_TO_REQUEST_PV'));
//
//         const result = await service.requestPV({
//             submissionID: 'sub1',
//             property: 'age',
//             value: 'unknown'
//         }, context);
//
//         expect(result.success).toBe(false);
//         expect(result.message).toContain('FAILED_TO_REQUEST_PV');
//     });
// });
//
//
//
// // describe('Submission.editSubmissionCollaborators', () => {
// //     let submission;
// //     let mockSubmissionDAO;
// //     let mockUserDAO;
// //     let mockContext;
// //     let mockSubmission;
// //     let mockUser;
// //
// //     beforeEach(() => {
// //         mockSubmission = {
// //             _id: 'sub1',
// //             submitterID: 'user1',
// //             studyID: 'study1',
// //             status: NEW,
// //             collaborators: []
// //         };
// //
// //         mockUser = {
// //             _id: 'user2',
// //             firstName: 'John',
// //             lastName: 'Doe',
// //             role: ROLES.SUBMITTER,
// //             organization: 'Test Org',
// //             studies: [{id: 'study1'}]
// //         };
// //
// //         mockSubmissionDAO = {
// //             findById: jest.fn(),
// //             update: jest.fn()
// //         };
// //
// //         mockUserDAO = {
// //             findFirst: jest.fn()
// //         };
// //
// //         // Mock all required dependencies for Submission constructor
// //         const mockOrganizationService = {
// //             organizationCollection: jest.fn()
// //         };
// //
// //         submission = new Submission(
// //             jest.fn(), // logCollection
// //             jest.fn(), // submissionCollection
// //             jest.fn(), // batchService
// //             jest.fn(), // userService
// //             mockOrganizationService, // organizationService
// //             jest.fn(), // notificationService
// //             jest.fn(), // dataRecordService
// //             jest.fn(), // fetchDataModelInfo
// //             jest.fn(), // awsService
// //             jest.fn(), // metadataQueueName
// //             jest.fn(), // s3Service
// //             jest.fn(), // emailParams
// //             [], // dataCommonsList
// //             [], // hiddenDataCommonsList
// //             jest.fn(), // validationCollection
// //             jest.fn(), // sqsLoaderQueue
// //             jest.fn(), // qcResultsService
// //             jest.fn(), // uploaderCLIConfigs
// //             jest.fn(), // submissionBucketName
// //             jest.fn(), // configurationService
// //             jest.fn(), // uploadingMonitor
// //             jest.fn(), // dataCommonsBucketMap
// //             jest.fn(), // authorizationService
// //             jest.fn() // dataModelService
// //         );
// //
// //         // Override the DAOs with our mocks
// //         submission.submissionDAO = mockSubmissionDAO;
// //         submission.userDAO = mockUserDAO;
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //
// //         global.verifySession = jest.fn(() => ({
// //             verifyInitialized: jest.fn()
// //         }));
// //
// //         // Mock replaceErrorString function
// //         const {replaceErrorString} = require('../../utility/string-util');
// //         replaceErrorString.mockImplementation((template, value) => template.replace('$item$', value));
// //
// //         global.ERROR = {
// //             SUBMISSION_NOT_EXIST: 'Submission does not exist',
// //             INVALID_STATUS_EDIT_COLLABORATOR: 'Submission status is invalid to edit collaborator; $item$',
// //             INVALID_SUBMISSION_STUDY: 'Invalid submission study',
// //             VERIFY: {
// //                 INVALID_PERMISSION: 'Invalid permission'
// //             },
// //             COLLABORATOR_NOT_EXIST: 'Collaborator does not exist',
// //             INVALID_COLLABORATOR_ROLE_SUBMITTER: 'Invalid collaborator role - must be submitter',
// //             INVALID_COLLABORATOR_STUDY: 'Invalid collaborator study',
// //             INVALID_COLLABORATOR_PERMISSION: 'Invalid collaborator permission',
// //             FAILED_ADD_SUBMISSION_COLLABORATOR: 'Failed to add submission collaborator'
// //         };
// //
// //         mockContext = {
// //             userInfo: {
// //                 _id: 'user1'
// //             }
// //         };
// //     });
// //
// //     it('should successfully add new collaborators', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(mockUser);
// //         mockSubmissionDAO.update.mockResolvedValue({
// //             ...mockSubmission,
// //             collaborators: params.collaborators
// //         });
// //
// //         const result = await submission.editSubmissionCollaborators(params, mockContext);
// //
// //         expect(submission._findByID).toHaveBeenCalledWith('sub1');
// //         expect(mockUserDAO.findFirst).toHaveBeenCalledWith({id: 'user2'});
// //         expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT,
// //                     collaboratorName: 'Doe, John',
// //                     Organization: 'Test Org'
// //                 }
// //             ],
// //             updatedAt: expect.any(Date)
// //         });
// //         expect(result).toBeDefined();
// //     });
// //
// //     it('should throw error when submission not found', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: []
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(null);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.SUBMISSION_NOT_EXIST);
// //     });
// //
// //     it('should throw error when submission status is invalid for editing', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: []
// //         };
// //
// //         const invalidStatusSubmission = {
// //             ...mockSubmission,
// //             status: 'COMPLETED'
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(invalidStatusSubmission);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow('Submission status is invalid to edit collaborator; \'COMPLETED\'');
// //     });
// //
// //     it('should throw error when submission has no study ID', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: []
// //         };
// //
// //         const submissionWithoutStudy = {
// //             ...mockSubmission,
// //             studyID: null
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(submissionWithoutStudy);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.INVALID_SUBMISSION_STUDY);
// //     });
// //
// //     it('should throw error when user is not the submitter', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: []
// //         };
// //
// //         const differentSubmitterSubmission = {
// //             ...mockSubmission,
// //             submitterID: 'user3'
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(differentSubmitterSubmission);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
// //     });
// //
// //     it('should throw error when collaborator user not found', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'nonexistent',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(null);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.COLLABORATOR_NOT_EXIST);
// //     });
// //
// //     it('should throw error when collaborator is not a submitter', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         const nonSubmitterUser = {
// //             ...mockUser,
// //             role: 'ADMIN'
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(nonSubmitterUser);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.INVALID_COLLABORATOR_ROLE_SUBMITTER);
// //     });
// //
// //     it('should throw error when collaborator does not have access to study', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         const userWithoutStudyAccess = {
// //             ...mockUser,
// //             studies: [{id: 'different-study'}]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(userWithoutStudyAccess);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
// //     });
// //
// //     it('should throw error when collaborator has invalid permission', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: 'INVALID_PERMISSION'
// //                 }
// //             ]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(mockUser);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.INVALID_COLLABORATOR_PERMISSION);
// //     });
// //
// //     it('should allow editing existing collaborators', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_VIEW
// //                 }
// //             ]
// //         };
// //
// //         const submissionWithExistingCollaborator = {
// //             ...mockSubmission,
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT,
// //                     collaboratorName: 'Doe, John',
// //                     Organization: 'Test Org'
// //                 }
// //             ]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(submissionWithExistingCollaborator);
// //         mockUserDAO.findFirst.mockResolvedValue(mockUser);
// //         mockSubmissionDAO.update.mockResolvedValue({
// //             ...submissionWithExistingCollaborator,
// //             collaborators: params.collaborators
// //         });
// //
// //         const result = await submission.editSubmissionCollaborators(params, mockContext);
// //
// //         expect(mockSubmissionDAO.update).toHaveBeenCalled();
// //         expect(result).toBeDefined();
// //     });
// //
// //     it('should handle user with "All" study access', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         const userWithAllStudyAccess = {
// //             ...mockUser,
// //             studies: [{id: 'All'}]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(userWithAllStudyAccess);
// //         mockSubmissionDAO.update.mockResolvedValue({
// //             ...mockSubmission,
// //             collaborators: params.collaborators
// //         });
// //
// //         const result = await submission.editSubmissionCollaborators(params, mockContext);
// //
// //         expect(result).toBeDefined();
// //     });
// //
// //     it('should handle user with string study IDs (backward compatibility)', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         const userWithStringStudies = {
// //             ...mockUser,
// //             studies: ['study1']
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(userWithStringStudies);
// //         mockSubmissionDAO.update.mockResolvedValue({
// //             ...mockSubmission,
// //             collaborators: params.collaborators
// //         });
// //
// //         const result = await submission.editSubmissionCollaborators(params, mockContext);
// //
// //         expect(result).toBeDefined();
// //     });
// //
// //     it('should throw error when submission update fails', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
// //         mockUserDAO.findFirst.mockResolvedValue(mockUser);
// //         mockSubmissionDAO.update.mockResolvedValue(null);
// //
// //         await expect(submission.editSubmissionCollaborators(params, mockContext))
// //             .rejects
// //             .toThrow(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
// //     });
// //
// //     it('should handle submission with no existing collaborators', async () => {
// //         const params = {
// //             submissionID: 'sub1',
// //             collaborators: [
// //                 {
// //                     collaboratorID: 'user2',
// //                     permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
// //                 }
// //             ]
// //         };
// //
// //         const submissionWithoutCollaborators = {
// //             ...mockSubmission,
// //             collaborators: null
// //         };
// //
// //         submission._findByID = jest.fn().mockResolvedValue(submissionWithoutCollaborators);
// //         mockUserDAO.findFirst.mockResolvedValue(mockUser);
// //         mockSubmissionDAO.update.mockResolvedValue({
// //             ...submissionWithoutCollaborators,
// //             collaborators: params.collaborators
// //         });
// //
// //         const result = await submission.editSubmissionCollaborators(params, mockContext);
// //
// //         expect(result).toBeDefined();
// //     });
// //
// //     it('should validate all valid submission statuses', async () => {
// //         const validStatuses = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, ARCHIVED, REJECTED, WITHDRAWN];
// //
// //         for (const status of validStatuses) {
// //             const params = {
// //                 submissionID: 'sub1',
// //                 collaborators: []
// //             };
// //
// //             const submissionWithStatus = {
// //                 ...mockSubmission,
// //                 status: status
// //             };
// //
// //             submission._findByID = jest.fn().mockResolvedValue(submissionWithStatus);
// //             mockSubmissionDAO.update.mockResolvedValue(submissionWithStatus);
// //
// //             const result = await submission.editSubmissionCollaborators(params, mockContext);
// //             expect(result).toBeDefined();
// //         }
// //     });
// // });
// //
//
