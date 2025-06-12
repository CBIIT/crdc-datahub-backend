const ApprovedStudyDAO = require('../dao/approvedStudy');
const prisma = require('../prisma');

jest.mock('../prisma', () => ({
    approvedStudy: {
        findUnique: jest.fn(),
    },
}));

describe('ApprovedStudyDAO.getApprovedStudyByID', () => {
    let dao;

    beforeEach(() => {
        dao = new ApprovedStudyDAO();
        jest.clearAllMocks();
    });

    it('should return study with _id when found', async () => {
        const mockStudy = { id: 123, studyName: 'Test Study', foo: 'bar' };
        prisma.approvedStudy.findUnique.mockResolvedValue(mockStudy);

        const result = await dao.getApprovedStudyByID(123);

        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: 123 } });
        expect(result).toEqual({ ...mockStudy, _id: mockStudy.id });
    });

    it('should return null when study not found', async () => {
        prisma.approvedStudy.findUnique.mockResolvedValue(null);

        const result = await dao.getApprovedStudyByID(456);

        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: 456 } });
        expect(result).toBeNull();
    });
});