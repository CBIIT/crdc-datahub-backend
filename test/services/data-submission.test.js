const ERROR = require('../../constants/error-constants');
const { Submission } = require('../../services/submission');
const {ValidationHandler} = require("../../utility/validation-handler");
const {ROLE} = require("../../constants/permission-scope-constants");
const {replaceErrorString} = require("../../utility/string-util"); // ← adjust path if needed

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

        // Instantiate Submission with mocked submissionCollection
        service = new Submission(
            null,                   // logCollection
            mockSubmissionCollection, // 👈 mocked collection
            null, null, null, null,
            null, null, null, null,
            null, null, [], [],    // dataCommonsList, hiddenDataCommonsList
            null, null, null, null,
            'bucket', null, null, {} // submissionBucketName, configService, monitor, bucketMap, authService
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

        mockScope = {
            isNoneScope: jest.fn().mockReturnValue(false),
        };
    });

    it('returns pending PVs when user has permission', async () => {
        mockAggregate.mockResolvedValue([mockSubmission]);
        service._getUserScope.mockResolvedValue(mockScope);
        service._isCollaborator.mockReturnValue(true);
        service.pendingPVDAO.findBySubmissionID.mockResolvedValue([
            { property: 'age', value: 'unknown' }
        ]);

        const result = await service.getPendingPVs({ submissionID: 'sub1' }, context);

        expect(result).toEqual([{ property: 'age', value: 'unknown' }]);
        expect(mockAggregate).toHaveBeenCalledWith(expect.any(Array));
    });

    it('throws error if submission is not found', async () => {
        mockAggregate.mockResolvedValue([]);

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

        // Patch: If dataModelService is undefined, define it on the service instance
        if (!service.dataModelService) {
            service.dataModelService = {};
        }
        service.dataModelService.getDataModelByDataCommonAndVersion = jest.fn().mockResolvedValue({
            props_: {
                age: {
                    terms: () => [{ origin_id: 'CDE-123' }]
                }
            }
        });

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

    it('throws if value is empty', async () => {
        await expect(service.requestPV({
            submissionID: 'sub1',
            property: 'age',
            value: '   '
        }, context)).rejects.toThrow(ERROR.EMPTY_PV_REQUEST_PV);
    });

    it('throws if user is not permitted', async () => {
        service._getUserScope.mockResolvedValue({ isNoneScope: () => true });
        service._isCollaborator.mockReturnValue(false);
        // Patch: If dataModelService is undefined, define it on the service instance
        if (!service.dataModelService) {
            service.dataModelService = {};
        }
        service.dataModelService.getDataModelByDataCommonAndVersion = jest.fn().mockResolvedValue({
            props_: {
                age: {
                    terms: () => [{ origin_id: 'CDE-123' }]
                }
            }
        });
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

        // Patch: If dataModelService is undefined, define it on the service instance
        if (!service.dataModelService) {
            service.dataModelService = {};
        }
        service.dataModelService.getDataModelByDataCommonAndVersion = jest.fn().mockResolvedValue({
            props_: {
                age: {
                    terms: () => [{ origin_id: 'CDE-123' }]
                }
            }
        });
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
        // Patch: If dataModelService is undefined, define it on the service instance
        if (!service.dataModelService) {
            service.dataModelService = {};
        }
        service.dataModelService.getDataModelByDataCommonAndVersion = jest.fn().mockResolvedValue({
            props_: {
                age: {
                    terms: () => [{ origin_id: 'CDE-123' }]
                }
            }
        });
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
        // Patch: If dataModelService is undefined, define it on the service instance
        if (!service.dataModelService) {
            service.dataModelService = {};
        }
        service.dataModelService.getDataModelByDataCommonAndVersion = jest.fn().mockResolvedValue({
            props_: {
                age: {
                    terms: () => [{ origin_id: 'CDE-123' }]
                }
            }
        });
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
