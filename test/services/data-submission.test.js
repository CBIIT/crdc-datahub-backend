const ERROR = require('../../constants/error-constants');
const { Submission } = require('../../services/submission'); // ← adjust path if needed

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
    let mockSubmissionCollection;
    let mockAggregate;

    beforeEach(() => {
        // Mock aggregate function
        mockAggregate = jest.fn();

        // Simulate MongoDB collection with aggregate
        mockSubmissionCollection = {
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
});
