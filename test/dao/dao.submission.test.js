const SubmissionDAO = require('../../dao/submission');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    submission: {
        findUnique: jest.fn(),
    },
}));

describe('SubmissionDAO', () => {
    let dao;

    beforeEach(() => {
        dao = new SubmissionDAO();
        jest.clearAllMocks();
    });

    it('should return submission with _id when found', async () => {
        const fakeSubmission = { id: 1, name: 'Test Submission' };
        prisma.submission.findUnique.mockResolvedValue(fakeSubmission);

        const result = await dao.findById(1);

        expect(prisma.submission.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(result).toEqual({ ...fakeSubmission, _id: fakeSubmission.id });
    });

    it('should return null when submission not found', async () => {
        prisma.submission.findUnique.mockResolvedValue(null);

        const result = await dao.findById(2);

        expect(prisma.submission.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
        expect(result).toBeNull();
    });
});