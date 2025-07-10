jest.mock('../prisma', () => ({
    approvedStudy: {
        findUnique: jest.fn()
    }
}));

const prisma = require('../prisma');
const ApprovedStudyDAO = require("../dao/approvedStudy");
const approvedStudyDAO = new ApprovedStudyDAO();

describe('getApprovedStudyByID', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return study with _id when found', async () => {
        const fakeStudy = { id: '123', name: 'Test Study' };
        prisma.approvedStudy.findUnique.mockResolvedValue(fakeStudy);
        const result = await approvedStudyDAO.getApprovedStudyByID('123');
        expect(result).toEqual({ ...fakeStudy, _id: fakeStudy.id });
        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: '123' } });
    });

    it('should return null when not found', async () => {
        prisma.approvedStudy.findUnique.mockResolvedValue(null);
        const result = await approvedStudyDAO.getApprovedStudyByID('notfound');
        expect(result).toBeNull();
        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: 'notfound' } });
    });
}); 