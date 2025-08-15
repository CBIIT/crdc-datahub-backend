const ERROR = require('../../constants/error-constants');
const { Submission } = require('../../services/submission');
const {ValidationHandler} = require("../../utility/validation-handler");
const {ROLE} = require("../../constants/permission-scope-constants");
const {replaceErrorString} = require("../../utility/string-util");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {INTENTION, DATA_TYPE, IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN,
    NEW,
    COLLABORATOR_PERMISSIONS,
    ARCHIVED,
    ACTIONS,
    VALIDATION_STATUS,
    VALIDATION,
    COMPLETED,
    CANCELED
} = require("../../constants/submission-constants");
const {getDataCommonsDisplayNamesForSubmission} = require("../../utility/data-commons-remapper");
const USER_PERMISSION_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");
const {USER} = require("../../crdc-datahub-database-drivers/constants/user-constants"); // ← adjust path if needed
jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));

describe('Submission.getPendingPVs', () => {
    let service;
    let context;
    let mockSubmission;
    let mockScope;
    let mockAggregate;

    beforeEach(() => {
        mockAggregate = jest.fn().mockResolvedValue([{ _id: 'sub1' }]);
        const mockSubmissionCollection = {
            aggregate: mockAggregate
        };
        const organizationService = new Organization(new MongoDBCollection())

        // Instantiate Submission with mocked submissionCollection
        service = new Submission(
            null,                   // logCollection
            mockSubmissionCollection, // 👈 mocked collection
            null, null, organizationService, null,
            null, null, null, null,
            null, null, [], [],    // dataCommonsList, hiddenDataCommonsList
            null, null, null, null,
            'bucket', null, null, {}, null, // submissionBucketName, configService, monitor, bucketMap, authService, dataModelService
            {
                getDataModelByDataCommonAndVersion: jest.fn().mockResolvedValue({
                    terms_: {
                        age: 'Age',
                        Age: 'Age'
                    }
                })
            },
            mockSubmissionCollection
        );

        // Mock dependencies
        service.pendingPVDAO = {
            findBySubmissionID: jest.fn(),
            insertOne: jest.fn()
        };

        service.userService = {
            getUsersByNotifications: jest.fn()
        };

        service.notificationService = {
            requestPVNotification: jest.fn()
        };

        service._getUserScope = jest.fn();
        service._isCollaborator = jest.fn();

        // Mock context and permission scope
        context = {
            userInfo: { _id: 'user1' }
        };

        mockSubmission = {
            _id: 'sub1',
            ownerID: 'user1',
            studyID: 'study123',
            organization: { _id: 'org1', name: 'Org Name', abbreviation: 'ORG' }
        };
        service._findByID = jest.fn().mockResolvedValue(mockSubmission);

        mockScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
        };
    });

    it('returns pending PVs when user has permission', async () => {
        service._getUserScope.mockResolvedValue(mockScope);
        service._isCollaborator.mockReturnValue(true);
        service.pendingPVDAO.findBySubmissionID.mockResolvedValue([
            { property: 'age', value: 'unknown' }
        ]);

        const result = await service.getPendingPVs({ submissionID: 'sub1' }, context);

        expect(result).toEqual([{ property: 'age', value: 'unknown' }]);
        expect(service._findByID).toHaveBeenCalledWith('sub1');
    });

    it('throws error if submission is not found', async () => {
        service._findByID.mockResolvedValue(null);
        await expect(
            service.getPendingPVs({ submissionID: 'sub1' }, context)
        ).rejects.toThrow(ERROR.SUBMISSION_NOT_EXIST);
    });

    it('throws error if user is not permitted', async () => {
        mockAggregate.mockResolvedValue([mockSubmission]);
        service._getUserScope.mockResolvedValue({
            isNoneScope: () => true
        });
        service._isCollaborator.mockReturnValue(false);

        await expect(
            service.getPendingPVs({ submissionID: 'sub1' }, context)
        ).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('successfully sends PV request', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        service._isCollaborator.mockReturnValue(true);
        service.userService.getUsersByNotifications.mockResolvedValue([
            { email: 'dc1@example.com', role: 'Data Commons Personnel' },
            { email: 'admin@example.com', role: 'ADMIN' }
        ]);
        service.pendingPVDAO.findBySubmissionID.mockResolvedValue([]);
        service.pendingPVDAO.insertOne.mockResolvedValue(true);
        service.notificationService.requestPVNotification.mockResolvedValue({ accepted: ['dc1@example.com'] });

        jest.spyOn(ValidationHandler, 'success').mockReturnValue(new ValidationHandler(true));

        const result = await service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: 'unknown',
            nodeName: 'Person',
            comment: 'Test comment'
        }, context);

        expect(result.success).toBe(true);
        expect(service.pendingPVDAO.insertOne).toHaveBeenCalledWith('sub1', 'age', 'unknown');
        expect(service.notificationService.requestPVNotification).toHaveBeenCalled();
    });

    it('throws if property is empty', async () => {
        await expect(service.requestPV({
            submissionID: 'sub1',
            property: '   ',
            value: 'value'
        }, context)).rejects.toThrow(ERROR.EMPTY_PROPERTY_REQUEST_PV);
    });

    it('throws if user is not permitted', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => true });
        service._isCollaborator.mockReturnValue(false);

        await expect(service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: 'unknown'
        }, context)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('handles no recipients found', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        service._isCollaborator.mockReturnValue(true);
        service.userService.getUsersByNotifications.mockResolvedValue([
            { email: 'nondc@example.com', role: 'ADMIN' }
        ]);

        jest.spyOn(ValidationHandler, 'handle').mockReturnValue(new ValidationHandler(false, 'NO_RECIPIENT_PV_REQUEST'));

        const result = await service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: 'unknown'
        }, context);

        expect(result.success).toBe(false);
        expect(result.message).toContain('NO_RECIPIENT_PV_REQUEST');
    });

    it('throws if insertOne fails', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        service._isCollaborator.mockReturnValue(true);
        service.userService.getUsersByNotifications.mockResolvedValue([
            { email: 'dc1@example.com', role: 'Data Commons Personnel' },
            { email: 'admin@example.com', role: 'ADMIN' }
        ]);
        service.pendingPVDAO.insertOne.mockResolvedValue(null);

        await expect(service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: 'unknown'
        }, context)).rejects.toThrow(replaceErrorString(ERROR.FAILED_TO_INSERT_REQUEST_PV, `submissionID: sub1, property: age, value: unknown`));
    });

    it('handles failed email send', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => false });
        service._isCollaborator.mockReturnValue(true);
        service.userService.getUsersByNotifications.mockResolvedValue([
            { email: 'dc@example.com', role: ROLE.DATA_COMMONS_PERSONNEL },
        ]);
        service.pendingPVDAO.insertOne.mockResolvedValue(true);
        service.notificationService.requestPVNotification.mockResolvedValue({ accepted: [] });

        jest.spyOn(ValidationHandler, 'handle').mockReturnValue(new ValidationHandler(false, 'FAILED_TO_REQUEST_PV'));

        const result = await service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: 'unknown'
        }, context);

        expect(result.success).toBe(false);
        expect(result.message).toContain('FAILED_TO_REQUEST_PV');
    });
});


jest.mock('../../dao/submission');
jest.mock('../../dao/program');
jest.mock('../../utility/string-util');
jest.mock('../../utility/data-commons-remapper');
jest.mock('../../dao/user');

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
jest.mock('../../verifier/user-info-verifier', () => ({
    verifySession: jest.fn(() => ({
        verifyInitialized: jest.fn()
    }))
}));


describe('Submission.getSubmission', () => {
    let submission;
    let mockSubmissionDAO;
    let mockUserDAO;
    let mockProgramDAO;
    let mockDataRecordService;
    let mockUserService;
    let mockS3Service;
    let mockContext;
    let mockSubmission;
    let mockUser;

    beforeEach(() => {
        mockSubmission = {
            _id: 'sub1',
            submitterID: 'user1',
            studyID: 'study1',
            status: 'NEW',
            bucketName: 'test-bucket',
            rootPath: 'test/root',
            programID: 'program1',
            dataFileSize: { size: 1000, formatted: '1KB' },
            nodeCount: 5,
            history: [
                { userID: 'user1', action: 'created' },
                { userID: 'user2', action: 'updated' }
            ],
            archived: false
        };

        mockUser = {
            _id: 'user1',
            firstName: 'John',
            lastName: 'Doe',
            role: USER.ROLES.SUBMITTER
        };

        mockSubmissionDAO = {
            findById: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn()
        };

        mockUserDAO = {
            findFirst: jest.fn()
        };

        mockProgramDAO = {
            findById: jest.fn()
        };

        mockDataRecordService = {
            countNodesBySubmissionID: jest.fn()
        };

        mockUserService = {
            getUserByID: jest.fn()
        };

        mockS3Service = {
            listFile: jest.fn()
        };

        // Mock all required dependencies for Submission constructor
        const mockOrganizationService = {
            organizationCollection: jest.fn()
        };

        submission = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            mockUserService, // userService
            mockOrganizationService, // organizationService
            jest.fn(), // notificationService
            mockDataRecordService, // dataRecordService
            jest.fn(), // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            mockS3Service, // s3Service
            { remindSubmissionDay: 30 }, // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            jest.fn(), // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            jest.fn(), // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            jest.fn(), // authorizationService
            jest.fn() // dataModelService
        );

        // Override the DAOs with our mocks
        submission.submissionDAO = mockSubmissionDAO;
        submission.userDAO = mockUserDAO;
        submission.programDAO = mockProgramDAO;
        submission._findByID = jest.fn();
        submission._getUserScope = jest.fn();
        submission._getS3DirectorySize = jest.fn();
        submission._getEveryReminderQuery = jest.fn();

        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        // global.ERROR = {
        //     INVALID_SUBMISSION_NOT_FOUND: 'Cant find the submission by submissionID',
        //     VERIFY: {
        //         INVALID_PERMISSION: 'Invalid permission'
        //     },
        //     FAILED_RECORD_FILESIZE_PROPERTY: 'Failed to record file size property'
        // };

        mockContext = {
            userInfo: {
                _id: 'user1',
                role: USER.ROLES.SUBMITTER
            }
        };
    });

    it('should successfully get submission with all updates', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataFileSize = { size: 2000, formatted: '2KB' };
        const mockOtherSubmissions = [
            { _id: 'sub2', status: IN_PROGRESS },
            { _id: 'sub3', status: SUBMITTED }
        ];
        const mockNodeCount = 10;
        const mockUser1 = { firstName: 'John', lastName: 'Doe' };
        const mockUser2 = { firstName: 'Jane', lastName: 'Smith' };
        const mockProgram = { _id: 'program1', name: 'Test Program' };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({ remindInactiveSubmission: true });

        mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
        mockSubmissionDAO.findMany.mockResolvedValue(mockOtherSubmissions);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(mockNodeCount);
        mockUserService.getUserByID
            .mockResolvedValueOnce(mockUser1)
            .mockResolvedValueOnce(mockUser2);
        mockProgramDAO.findById.mockResolvedValue(mockProgram);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(submission._findByID).toHaveBeenCalledWith('sub1');
        expect(submission._getUserScope).toHaveBeenCalledWith(
            mockContext.userInfo,
            USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW,
            mockSubmission
        );
        expect(submission._getS3DirectorySize).toHaveBeenCalledWith('test-bucket', 'test/root/file/');
        expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
            dataFileSize: mockDataFileSize,
            updatedAt: expect.any(Date)
        });
        expect(mockSubmissionDAO.findMany).toHaveBeenCalledWith({
            studyID: 'study1',
            status: {
                in: [IN_PROGRESS, SUBMITTED, RELEASED, REJECTED, WITHDRAWN],
            },
            NOT: {
                id: 'sub1',
            },
        });
        expect(mockDataRecordService.countNodesBySubmissionID).toHaveBeenCalledWith('sub1');
        expect(mockUserService.getUserByID).toHaveBeenCalledTimes(2);
        expect(mockProgramDAO.findById).toHaveBeenCalledWith('program1');
        expect(result).toBeDefined();
    });

    it('should throw error when submission not found', async () => {
        const params = { _id: 'sub1' };

        submission._findByID = jest.fn().mockResolvedValue(null);

        await expect(submission.getSubmission(params, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
    });

    it('should throw error when user has no permission', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => true };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);

        await expect(submission.getSubmission(params, mockContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('should handle submission without study ID', async () => {
        const params = { _id: 'sub1' };
        const submissionWithoutStudy = { ...mockSubmission, studyID: null };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(submissionWithoutStudy);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(submissionWithoutStudy);
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithoutStudy);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockSubmissionDAO.findMany).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle archived submission', async () => {
        const params = { _id: 'sub1' };
        const archivedSubmission = { ...mockSubmission, archived: true };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(archivedSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(archivedSubmission);
        mockSubmissionDAO.findMany.mockResolvedValue([]);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(archivedSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockDataRecordService.countNodesBySubmissionID).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle submission without program ID', async () => {
        const params = { _id: 'sub1' };
        const submissionWithoutProgram = { ...mockSubmission, programID: null };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(submissionWithoutProgram);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(submissionWithoutProgram);
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithoutProgram);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockProgramDAO.findById).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle data file size update failure', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataFileSize = { size: 2000, formatted: '2KB' };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(null);
        mockSubmissionDAO.findMany.mockResolvedValue([]);

        await expect(submission.getSubmission(params, mockContext))
            .rejects
            .toThrow('Failed to record the file size property for a submission');
    });

    it('should handle node count update failure', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataFileSize = { size: 1000, formatted: '1KB' };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update
            .mockResolvedValueOnce(mockSubmission) // First call for dataFileSize update
            .mockResolvedValueOnce(null); // Second call for nodeCount update
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(10);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        // Should not throw error for node count update failure, just log
        expect(result).toBeDefined();
    });

    it('should handle history with missing user information', async () => {
        const params = { _id: 'sub1' };
        const submissionWithHistory = {
            ...mockSubmission,
            history: [
                { userID: 'user1', action: 'created' },
                { action: 'updated' }, // No userID
                { userID: 'user2', userName: 'Jane Smith', action: 'modified' } // Already has userName
            ]
        };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(submissionWithHistory);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(submissionWithHistory);
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
        mockUserService.getUserByID.mockResolvedValue({ firstName: 'John', lastName: 'Doe' });

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithHistory);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockUserService.getUserByID).toHaveBeenCalledWith('user1');
        expect(result).toBeDefined();
    });

    it('should handle non-submitter user', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };
        const nonSubmitterContext = {
            userInfo: {
                _id: 'user2',
                role: 'ADMIN'
            }
        };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 2000, formatted: '2KB' }); // Different size to trigger update
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, nonSubmitterContext);

        // For non-submitter users, the update should still be called for dataFileSize
        expect(mockSubmissionDAO.update).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle submitter user with accessedAt update', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({ remindInactiveSubmission: true });

        mockSubmissionDAO.update.mockResolvedValue(mockSubmission);
        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
            accessedAt: expect.any(Date),
            remindInactiveSubmission: true
        });
        expect(result).toBeDefined();
    });

    it('should handle submission with no data file size change', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataFileSize = { size: 1000, formatted: '1KB' }; // Same as existing

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue(mockDataFileSize);
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith('sub1', {
            dataFileSize: mockDataFileSize,
            updatedAt: expect.any(Date)
        });
        expect(result).toBeDefined();
    });

    it('should handle submission with no node count change', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5); // Same as existing

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockSubmissionDAO.update).not.toHaveBeenCalledWith('sub1', {
            updatedAt: expect.any(Date),
            nodeCount: 5
        });
        expect(result).toBeDefined();
    });

    it('should handle submission with organization already set', async () => {
        const params = { _id: 'sub1' };
        const submissionWithOrg = {
            ...mockSubmission,
            organization: { _id: 'org1', name: 'Test Organization' }
        };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(submissionWithOrg);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithOrg);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockProgramDAO.findById).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle empty history array', async () => {
        const params = { _id: 'sub1' };
        const submissionWithEmptyHistory = { ...mockSubmission, history: [] };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(submissionWithEmptyHistory);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(submissionWithEmptyHistory);

        const result = await submission.getSubmission(params, mockContext);

        expect(mockUserService.getUserByID).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle user service returning null for history user', async () => {
        const params = { _id: 'sub1' };
        const mockUserScope = { isNoneScope: () => false };

        submission._findByID = jest.fn().mockResolvedValue(mockSubmission);
        submission._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
        submission._getS3DirectorySize = jest.fn().mockResolvedValue({ size: 1000, formatted: '1KB' });
        submission._getEveryReminderQuery = jest.fn().mockReturnValue({});

        mockSubmissionDAO.findMany.mockResolvedValue([]);
        mockDataRecordService.countNodesBySubmissionID.mockResolvedValue(5);
        mockUserService.getUserByID.mockResolvedValue(null);

        const {getDataCommonsDisplayNamesForSubmission} = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockReturnValue(mockSubmission);

        const result = await submission.getSubmission(params, mockContext);

        expect(result).toBeDefined();
        // History should remain unchanged when user is not found
        expect(mockSubmission.history[0].userName).toBeUndefined();
    });
});

describe("Submission.createSubmission", () => {
    let submissionService;
    let mockSubmissionDAO, mockUserService, mockOrganizationService;
    let mockContext, mockParams, mockApprovedStudy, mockProgram;

    beforeEach(() => {
        mockSubmissionDAO = {
            create: jest.fn(),
            findMany: jest.fn(),
        };
        mockUserService = {
            getUserByID: jest.fn(),
        };
        mockOrganizationService = {
            findOneByStudyID: jest.fn(),
        };

        // The correct order and type of arguments for Submission constructor
        // See Submission.js for the correct signature
        submissionService = new Submission(
            { insert: jest.fn() }, // logCollection
            mockSubmissionDAO, // submissionCollection
            {}, // batchService
            mockUserService, // userService
            mockOrganizationService, // organizationService
            {}, // notificationService
            {}, // dataRecordService
            jest.fn(), // fetchDataModelInfo
            {}, // awsService
            {}, // metadataQueueName
            {}, // s3Service
            {}, // emailParams
            ["commonsA"], // dataCommonsList
            [], // hiddenDataCommonsList
            {}, // validationCollection
            {}, // sqsLoaderQueue
            {}, // qcResultsService
            {}, // uploaderCLIConfigs
            {}, // submissionBucketName
            {}, // configurationService
            {}, // uploadingMonitor
            {}, // dataCommonsBucketMap
            {}, // authorizationService
            {}, // dataModelService
        );

        // Set up allowed/hidden data commons for validation
        submissionService.allowedDataCommons = new Set(["commonsA"]);
        submissionService.hiddenDataCommons = new Set();

        // Mock user context
        mockContext = {
            userInfo: {
                _id: "user1",
                firstName: "Test",
                lastName: "User",
                email: "test@user.com",
                role: "Submitter"
            }
        };

        // Mock params for a valid submission
        mockParams = {
            name: "Test Submission",
            studyID: "study123",
            dataCommons: "commonsA",
            intention: INTENTION.UPDATE,
            dataType: DATA_TYPE.METADATA_AND_DATA_FILES
        };

        mockApprovedStudy = {
            _id: "study123",
            dbGaPID: "dbgap-123",
            controlledAccess: false,
            pendingModelChange: false,
        };

        mockProgram = {
            _id: "program1"
        };

        // Mock _getUserScope to always allow
        submissionService._getUserScope = jest.fn().mockResolvedValue({
            isNoneScope: () => false
        });

        // Mock fetchDataModelInfo and _getModelVersion
        submissionService.fetchDataModelInfo = jest.fn().mockResolvedValue([{ version: "v1" }]);
        submissionService._getModelVersion = jest.fn().mockReturnValue("v1");

        // Mock _findApprovedStudies
        submissionService._findApprovedStudies = jest.fn().mockResolvedValue([mockApprovedStudy]);

        // Mock organizationService.findOneByStudyID
        mockOrganizationService.findOneByStudyID.mockResolvedValue(mockProgram);

        // Mock userService.getUserByID
        mockUserService.getUserByID.mockResolvedValue({ firstName: "Contact", lastName: "Person", email: "contact@person.com" });

        // Mock submissionDAO.create to return a submission object
        mockSubmissionDAO.create.mockImplementation((submission) => {
            return { ...submission, _id: "submission1" };
        });

        // Mock _remindPrimaryContactEmail to resolve
        submissionService._remindPrimaryContactEmail = jest.fn().mockResolvedValue();

        // Mock _findByID to return the created submission
        submissionService._findByID = jest.fn().mockResolvedValue({ _id: "submission1", ...mockParams });

        // Patch global.ERROR if not present
        // if (!global.ERROR) {
        //     global.ERROR = ERROR;
        // }
    });

    it("should throw error if submission intention is invalid", async () => {
        // Provide an invalid intention
        const invalidParams = { ...mockParams, intention: "invalid_intention" };
        await expect(submissionService.createSubmission(invalidParams, mockContext))
            .rejects
            .toThrow(ERROR.CREATE_SUBMISSION_INVALID_INTENTION);
    });

    it("should throw error if user does not have permission", async () => {
        submissionService._getUserScope.mockResolvedValueOnce({
            isNoneScope: () => true
        });
        await expect(submissionService.createSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it("should throw error if no approved study found", async () => {
        // Simulate valid intention and dataType to avoid intention/dataType errors
        submissionService._findApprovedStudies.mockResolvedValueOnce([]);
        await expect(submissionService.createSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.CREATE_SUBMISSION_NO_MATCHING_STUDY);
    });

    it("should throw error if no associated program found", async () => {
        // Simulate valid intention and dataType to avoid intention/dataType errors
        submissionService._findApprovedStudies.mockResolvedValueOnce([mockApprovedStudy]);
        mockOrganizationService.findOneByStudyID.mockResolvedValueOnce(null);
        await expect(submissionService.createSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.CREATE_SUBMISSION_NO_ASSOCIATED_PROGRAM);
    });

    it("should throw error if approved study is controlled access but missing dbGaPID", async () => {
        // Simulate valid intention and dataType to avoid intention/dataType errors
        submissionService._findApprovedStudies.mockResolvedValueOnce([
            { ...mockApprovedStudy, controlledAccess: true, dbGaPID: null }
        ]);
        await expect(submissionService.createSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.MISSING_CREATE_SUBMISSION_DBGAPID);
    });

    it("should throw error if approved study has pending model change", async () => {
        // Simulate valid intention and dataType to avoid intention/dataType errors
        submissionService._findApprovedStudies.mockResolvedValueOnce([
            { ...mockApprovedStudy, pendingModelChange: true }
        ]);
        await expect(submissionService.createSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.PENDING_APPROVED_STUDY);
    });
});

describe('Submission.editSubmissionCollaborators', () => {
    let submissionService;
    let mockSubmissionDAO, mockUserDAO;
    let mockContext, mockParams, mockSubmission;

    beforeEach(() => {
        mockSubmissionDAO = {
            update: jest.fn()
        };

        mockUserDAO = {
            findFirst: jest.fn()
        };

        // Create submission service with mocked dependencies
        submissionService = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            jest.fn(), // userService
            jest.fn(), // organizationService
            jest.fn(), // notificationService
            jest.fn(), // dataRecordService
            jest.fn(), // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            jest.fn(), // s3Service
            jest.fn(), // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            jest.fn(), // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            jest.fn(), // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            jest.fn(), // authorizationService
            jest.fn() // dataModelService
        );

        // Override DAOs with mocks
        submissionService.submissionDAO = mockSubmissionDAO;
        submissionService.userDAO = mockUserDAO;

        // Mock _findByID method
        submissionService._findByID = jest.fn();

        // Mock _verifyStudyInUserStudies method
        submissionService._verifyStudyInUserStudies = jest.fn();

        // Mock getDataCommonsDisplayNamesForSubmission
        const { getDataCommonsDisplayNamesForSubmission } = require('../../utility/data-commons-remapper');
        getDataCommonsDisplayNamesForSubmission.mockImplementation((submission) => submission);

        // Mock getCurrentTime
        global.getCurrentTime = jest.fn(() => new Date('2023-01-01T00:00:00Z'));

        // Mock context
        mockContext = {
            userInfo: {
                _id: 'user1',
                firstName: 'John',
                lastName: 'Doe',
                role: USER.ROLES.SUBMITTER
            }
        };

        // Mock submission
        mockSubmission = {
            _id: 'sub1',
            submitterID: 'user1',
            studyID: 'study123',
            status: NEW,
            collaborators: []
        };

        // Mock params
        mockParams = {
            submissionID: 'sub1',
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                }
            ]
        };
    });

    it('should successfully edit submission collaborators', async () => {
        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' },
            studies: ['study123']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue({
            ...mockSubmission,
            collaborators: mockParams.collaborators
        });

        const result = await submissionService.editSubmissionCollaborators(mockParams, mockContext);

        expect(submissionService._findByID).toHaveBeenCalledWith('sub1');
        expect(mockUserDAO.findFirst).toHaveBeenCalledWith({ id: 'user2' });
        expect(submissionService._verifyStudyInUserStudies).toHaveBeenCalledWith(mockUser, 'study123');
        expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: { name: 'Test Org' }
                }
            ],
            updatedAt: expect.any(Date)
        });
        expect(result).toBeDefined();
    });

    it('should throw error when submission not found', async () => {
        submissionService._findByID.mockResolvedValue(null);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.SUBMISSION_NOT_EXIST);
    });

    it('should throw error when submission status is invalid', async () => {
        const invalidSubmission = { ...mockSubmission, status: 'INVALID_STATUS' };
        submissionService._findByID.mockResolvedValue(invalidSubmission);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(replaceErrorString(ERROR.INVALID_STATUS_EDIT_COLLABORATOR, "'INVALID_STATUS'"));
    });

    it('should throw error when submission has no study ID', async () => {
        const submissionWithoutStudy = { ...mockSubmission, studyID: null };
        submissionService._findByID.mockResolvedValue(submissionWithoutStudy);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_SUBMISSION_STUDY);
    });

    it('should throw error when user is not the submitter', async () => {
        const nonSubmitterContext = {
            userInfo: {
                _id: 'user2',
                role: USER.ROLES.SUBMITTER
            }
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);

        await expect(submissionService.editSubmissionCollaborators(mockParams, nonSubmitterContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('should throw error when collaborator does not exist', async () => {
        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(null);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.COLLABORATOR_NOT_EXIST);
    });

    it('should throw error when collaborator is not a submitter', async () => {
        const nonSubmitterUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.ADMIN
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(nonSubmitterUser);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_COLLABORATOR_ROLE_SUBMITTER);
    });

    it('should throw error when collaborator does not have access to study', async () => {
        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            studies: ['different_study']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(false);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_COLLABORATOR_STUDY);
    });

    it('should throw error when collaborator permission is invalid', async () => {
        const invalidParams = {
            submissionID: 'sub1',
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: 'INVALID_PERMISSION'
                }
            ]
        };

        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            studies: ['study123']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);

        await expect(submissionService.editSubmissionCollaborators(invalidParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_COLLABORATOR_PERMISSION);
    });

    it('should handle existing collaborator without re-validation', async () => {
        const submissionWithCollaborator = {
            ...mockSubmission,
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                }
            ]
        };

        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' }
        };

        submissionService._findByID.mockResolvedValue(submissionWithCollaborator);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        mockSubmissionDAO.update.mockResolvedValue(submissionWithCollaborator);

        const result = await submissionService.editSubmissionCollaborators(mockParams, mockContext);

        // Should not call _verifyStudyInUserStudies for existing collaborator
        expect(submissionService._verifyStudyInUserStudies).not.toHaveBeenCalled();
        expect(mockSubmissionDAO.update).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle submission without collaborators array', async () => {
        const submissionWithoutCollaborators = {
            ...mockSubmission,
            collaborators: undefined
        };

        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' },
            studies: ['study123']
        };

        submissionService._findByID.mockResolvedValue(submissionWithoutCollaborators);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue({
            ...submissionWithoutCollaborators,
            collaborators: mockParams.collaborators
        });

        const result = await submissionService.editSubmissionCollaborators(mockParams, mockContext);

        expect(mockSubmissionDAO.update).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should throw error when update fails', async () => {
        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' },
            studies: ['study123']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue(null);

        await expect(submissionService.editSubmissionCollaborators(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.FAILED_ADD_SUBMISSION_COLLABORATOR);
    });

    it('should handle multiple collaborators', async () => {
        const multipleCollaboratorsParams = {
            submissionID: 'sub1',
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                },
                {
                    collaboratorID: 'user3',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                }
            ]
        };

        const mockUser2 = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org 1' },
            studies: ['study123']
        };

        const mockUser3 = {
            _id: 'user3',
            firstName: 'Bob',
            lastName: 'Johnson',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org 2' },
            studies: ['study123']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst
            .mockResolvedValueOnce(mockUser2)
            .mockResolvedValueOnce(mockUser3);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue({
            ...mockSubmission,
            collaborators: multipleCollaboratorsParams.collaborators
        });

        const result = await submissionService.editSubmissionCollaborators(multipleCollaboratorsParams, mockContext);

        expect(mockUserDAO.findFirst).toHaveBeenCalledTimes(2);
        expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
            collaborators: [
                {
                    collaboratorID: 'user2',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Smith, Jane',
                    Organization: { name: 'Test Org 1' }
                },
                {
                    collaboratorID: 'user3',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT,
                    collaboratorName: 'Johnson, Bob',
                    Organization: { name: 'Test Org 2' }
                }
            ],
            updatedAt: expect.any(Date)
        });
        expect(result).toBeDefined();
    });

    it('should handle user with "All" study access', async () => {
        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' },
            studies: ['All']
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue({
            ...mockSubmission,
            collaborators: mockParams.collaborators
        });

        const result = await submissionService.editSubmissionCollaborators(mockParams, mockContext);

        expect(submissionService._verifyStudyInUserStudies).toHaveBeenCalledWith(mockUser, 'study123');
        expect(result).toBeDefined();
    });

    it('should handle user with object-based studies array', async () => {
        const mockUser = {
            _id: 'user2',
            firstName: 'Jane',
            lastName: 'Smith',
            role: USER.ROLES.SUBMITTER,
            organization: { name: 'Test Org' },
            studies: [{ id: 'study123' }]
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        mockUserDAO.findFirst.mockResolvedValue(mockUser);
        submissionService._verifyStudyInUserStudies.mockReturnValue(true);
        mockSubmissionDAO.update.mockResolvedValue({
            ...mockSubmission,
            collaborators: mockParams.collaborators
        });

        const result = await submissionService.editSubmissionCollaborators(mockParams, mockContext);

        expect(submissionService._verifyStudyInUserStudies).toHaveBeenCalledWith(mockUser, 'study123');
        expect(result).toBeDefined();
    });
});

describe('Submission.submissionAction', () => {
    let submissionService;
    let mockContext, mockParams, mockSubmission;

    beforeEach(() => {
        // Create submission service with mocked dependencies
        submissionService = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            jest.fn(), // userService
            jest.fn(), // organizationService
            jest.fn(), // notificationService
            jest.fn(), // dataRecordService
            jest.fn(), // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            jest.fn(), // s3Service
            jest.fn(), // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            jest.fn(), // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            jest.fn(), // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            jest.fn(), // authorizationService
            jest.fn() // dataModelService
        );

        // Mock methods
        submissionService._findByID = jest.fn();

        // Mock context
        mockContext = {
            userInfo: {
                _id: 'user1',
                email: 'user@example.com',
                IDP: 'test-idp',
                role: USER.ROLES.SUBMITTER
            }
        };

        // Mock submission
        mockSubmission = {
            _id: 'sub1',
            submitterID: 'user1',
            studyID: 'study123',
            status: IN_PROGRESS,
            bucketName: 'test-bucket',
            rootPath: 'test/root',
            history: [],
            collaborators: []
        };

        // Mock params
        mockParams = {
            submissionID: 'sub1',
            action: ACTIONS.SUBMIT,
            comment: 'Test comment'
        };
    });

    it('should throw error when submission not found', async () => {
        submissionService._findByID.mockResolvedValue(null);

        await expect(submissionService.submissionAction(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.SUBMISSION_NOT_EXIST);
    });
});

describe('Submission.validateSubmission', () => {
    let submissionService;
    let mockValidationDAO, mockDataRecordService;
    let mockContext, mockParams, mockSubmission;

    beforeEach(() => {
        mockValidationDAO = {
            create: jest.fn()
        };

        mockDataRecordService = {
            validateMetadata: jest.fn()
        };

        // Create submission service with mocked dependencies
        submissionService = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            jest.fn(), // userService
            jest.fn(), // organizationService
            jest.fn(), // notificationService
            mockDataRecordService, // dataRecordService
            jest.fn(), // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            jest.fn(), // s3Service
            jest.fn(), // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            mockValidationDAO, // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            jest.fn(), // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            jest.fn(), // authorizationService
            jest.fn() // dataModelService
        );

        // Override DAOs with mocks to prevent Prisma calls
        submissionService.pendingPVDAO = { findBySubmissionID: jest.fn(), insertOne: jest.fn() };
        submissionService.submissionDAO = { update: jest.fn(), create: jest.fn(), findById: jest.fn() };
        submissionService.programDAO = { findById: jest.fn() };
        submissionService.userDAO = { findById: jest.fn() };
        submissionService.approvedStudyDAO = { findMany: jest.fn() };
        submissionService.validationDAO = mockValidationDAO;

        // Mock methods
        submissionService._findByID = jest.fn();
        submissionService._getUserScope = jest.fn();
        submissionService._isCollaborator = jest.fn();
        submissionService._updateValidationStatus = jest.fn();
        submissionService._recordSubmissionValidation = jest.fn();

        // Mock getCurrentTime
        global.getCurrentTime = jest.fn(() => new Date('2023-01-01T00:00:00Z'));

        // Mock context
        mockContext = {
            userInfo: {
                _id: 'user1',
                role: USER.ROLES.SUBMITTER
            }
        };

        // Mock submission
        mockSubmission = {
            _id: 'sub1',
            submitterID: 'user1',
            studyID: 'study123',
            status: SUBMITTED,
            metadataValidationStatus: VALIDATION_STATUS.NEW,
            fileValidationStatus: VALIDATION_STATUS.NEW,
            crossSubmissionStatus: VALIDATION_STATUS.NEW,
            updatedAt: new Date()
        };

        // Mock params
        mockParams = {
            _id: 'sub1',
            types: [VALIDATION.TYPES.METADATA],
            scope: VALIDATION.SCOPE.NEW
        };
    });

    it('should throw error when submission not found', async () => {
        submissionService._findByID.mockResolvedValue(null);

        await expect(submissionService.validateSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
    });

    it('should throw error when user has no permission', async () => {
        const mockCreateScope = { isNoneScope: () => true };
        const mockReviewScope = { isNoneScope: () => true };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope
            .mockResolvedValueOnce(mockCreateScope)
            .mockResolvedValueOnce(mockReviewScope);
        submissionService._isCollaborator.mockReturnValue(false);

        await expect(submissionService.validateSubmission(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_VALIDATE_METADATA);
    });

    it('should allow validation for collaborator', async () => {
        const mockCreateScope = { isNoneScope: () => true };
        const mockReviewScope = { isNoneScope: () => true };
        const mockValidationRecord = { id: 'validation1' };
        const mockValidationResult = { success: true };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope
            .mockResolvedValueOnce(mockCreateScope)
            .mockResolvedValueOnce(mockReviewScope);
        submissionService._isCollaborator.mockReturnValue(true);
        submissionService._updateValidationStatus.mockResolvedValue();
        mockValidationDAO.create.mockResolvedValue(mockValidationRecord);
        mockDataRecordService.validateMetadata.mockResolvedValue(mockValidationResult);
        submissionService._recordSubmissionValidation.mockResolvedValue(mockSubmission);

        const result = await submissionService.validateSubmission(mockParams, mockContext);

        expect(result).toEqual(mockValidationResult);
    });
});

describe('Submission.updateSubmissionModelVersion', () => {
    let submissionService;
    let mockSubmissionDAO;
    let mockContext, mockParams, mockSubmission;

    beforeEach(() => {
        mockSubmissionDAO = {
            update: jest.fn()
        };

        // Create submission service with mocked dependencies
        submissionService = new Submission(
            jest.fn(), // logCollection
            jest.fn(), // submissionCollection
            jest.fn(), // batchService
            jest.fn(), // userService
            jest.fn(), // organizationService
            jest.fn(), // notificationService
            jest.fn(), // dataRecordService
            jest.fn(), // fetchDataModelInfo
            jest.fn(), // awsService
            jest.fn(), // metadataQueueName
            jest.fn(), // s3Service
            jest.fn(), // emailParams
            [], // dataCommonsList
            [], // hiddenDataCommonsList
            jest.fn(), // validationCollection
            jest.fn(), // sqsLoaderQueue
            jest.fn(), // qcResultsService
            jest.fn(), // uploaderCLIConfigs
            jest.fn(), // submissionBucketName
            jest.fn(), // configurationService
            jest.fn(), // uploadingMonitor
            jest.fn(), // dataCommonsBucketMap
            jest.fn(), // authorizationService
            jest.fn() // dataModelService
        );

        // Override DAO with mock
        submissionService.submissionDAO = mockSubmissionDAO;

        // Mock methods
        submissionService._findByID = jest.fn();
        submissionService._getUserScope = jest.fn();
        submissionService.fetchDataModelInfo = jest.fn();
        submissionService._getAllModelVersions = jest.fn();
        submissionService._resetValidation = jest.fn();

        // Mock getCurrentTime
        global.getCurrentTime = jest.fn(() => new Date('2023-01-01T00:00:00Z'));

        // Mock context
        mockContext = {
            userInfo: {
                _id: 'user1',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                dataCommons: ['commonsA']
            }
        };

        // Mock submission
        mockSubmission = {
            _id: 'sub1',
            submitterID: 'user1',
            studyID: 'study123',
            status: IN_PROGRESS,
            dataCommons: 'commonsA',
            modelVersion: 'v1'
        };

        // Mock params
        mockParams = {
            _id: 'sub1',
            version: 'v2'
        };
    });

    it('should successfully update submission model version', async () => {
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];
        const updatedSubmission = { ...mockSubmission, modelVersion: 'v2' };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);
        mockSubmissionDAO.update.mockResolvedValue(updatedSubmission);
        submissionService._resetValidation.mockResolvedValue();

        // Mock logCollection.insert to avoid TypeError
        submissionService.logCollection = { insert: jest.fn().mockResolvedValue() };

        // Also mock _notifyConfigurationChange since it is awaited
        submissionService._notifyConfigurationChange = jest.fn().mockResolvedValue();

        const result = await submissionService.updateSubmissionModelVersion(mockParams, mockContext);

        expect(submissionService._findByID).toHaveBeenCalledWith('sub1');
        expect(submissionService._getUserScope).toHaveBeenCalledWith(
            mockContext.userInfo,
            USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.REVIEW,
            mockSubmission
        );
        expect(submissionService.fetchDataModelInfo).toHaveBeenCalled();
        expect(submissionService._getAllModelVersions).toHaveBeenCalledWith(mockDataModels, 'commonsA');
        expect(mockSubmissionDAO.update).toHaveBeenCalledWith('sub1', {
            modelVersion: 'v2',
            updatedAt: expect.any(Date)
        });
        expect(submissionService._resetValidation).toHaveBeenCalledWith('sub1');
        expect(submissionService.logCollection.insert).toHaveBeenCalled(); // Ensure log is called
        expect(submissionService._notifyConfigurationChange).toHaveBeenCalled(); // Ensure notification is called
        expect(result).toEqual(updatedSubmission);
    });

    it('should throw error when submission not found', async () => {
        submissionService._findByID.mockResolvedValue(null);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
    });

    it('should throw error when user has no permission', async () => {
        const mockUserScope = { isNoneScope: () => true };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });

    it('should throw error when version is invalid', async () => {
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }];
        const validVersions = ['v1'];

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, mockContext))
            .rejects
            .toThrow(replaceErrorString(ERROR.INVALID_MODEL_VERSION, 'v2'));
    });

    it('should throw error when submission status is invalid', async () => {
        const invalidSubmission = { ...mockSubmission, status: SUBMITTED };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];

        submissionService._findByID.mockResolvedValue(invalidSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, mockContext))
            .rejects
            .toThrow(replaceErrorString(ERROR.INVALID_SUBMISSION_STATUS_MODEL_VERSION, SUBMITTED));
    });

    it('should throw error when user has no permission for model version', async () => {
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];
        const nonDCPUserContext = {
            userInfo: {
                _id: 'user1',
                role: USER.ROLES.SUBMITTER,
                dataCommons: ['commonsB']
            }
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, nonDCPUserContext))
            .rejects
            .toThrow(ERROR.INVALID_MODEL_VERSION_PERMISSION);
    });

    it('should return submission when version is already set', async () => {
        const submissionWithVersion = { ...mockSubmission, modelVersion: 'v2' };
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];

        submissionService._findByID.mockResolvedValue(submissionWithVersion);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);

        const result = await submissionService.updateSubmissionModelVersion(mockParams, mockContext);

        expect(mockSubmissionDAO.update).not.toHaveBeenCalled();
        expect(submissionService._resetValidation).not.toHaveBeenCalled();
        expect(result).toEqual(submissionWithVersion);
    });

    it('should throw error when update fails', async () => {
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);
        mockSubmissionDAO.update.mockResolvedValue(null);

        await expect(submissionService.updateSubmissionModelVersion(mockParams, mockContext))
            .rejects
            .toThrow(ERROR.FAILED_UPDATE_MODEL_VERSION + '; submissionID: sub1');
    });

    it('should handle user with multiple data commons', async () => {
        const mockUserScope = { isNoneScope: () => false };
        const mockDataModels = [{ version: 'v1' }, { version: 'v2' }];
        const validVersions = ['v1', 'v2'];
        const updatedSubmission = { ...mockSubmission, modelVersion: 'v2' };
        const userWithMultipleCommons = {
            userInfo: {
                _id: 'user1',
                role: USER.ROLES.DATA_COMMONS_PERSONNEL,
                dataCommons: ['commonsA', 'commonsB']
            }
        };

        submissionService._findByID.mockResolvedValue(mockSubmission);
        submissionService._getUserScope.mockResolvedValue(mockUserScope);
        submissionService.fetchDataModelInfo.mockResolvedValue(mockDataModels);
        submissionService._getAllModelVersions.mockReturnValue(validVersions);
        mockSubmissionDAO.update.mockResolvedValue(updatedSubmission);
        submissionService._resetValidation.mockResolvedValue();

        // Mock logCollection.insert to avoid TypeError and to assert it is called
        submissionService.logCollection = {
            insert: jest.fn().mockResolvedValue()
        };

        const result = await submissionService.updateSubmissionModelVersion(mockParams, userWithMultipleCommons);

        expect(result).toEqual(updatedSubmission);
        expect(submissionService.logCollection.insert).toHaveBeenCalled();
    });
});
