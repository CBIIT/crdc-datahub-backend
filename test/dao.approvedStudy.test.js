const {getApprovedStudyByID} = require('../dao/approvedStudy');

jest.mock('../prisma', () => ({
    approvedStudy: {
        findUnique: jest.fn()
    }
}));

const prisma = require('../prisma');

describe('getApprovedStudyByID', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return study with _id when found', async () => {
        const fakeStudy = { id: '123', name: 'Test Study' };
        prisma.approvedStudy.findUnique.mockResolvedValue(fakeStudy);
        const result = await getApprovedStudyByID('123');
        expect(result).toEqual({ ...fakeStudy, _id: fakeStudy.id });
        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: '123' } });
    });

    it('should return null when not found', async () => {
        prisma.approvedStudy.findUnique.mockResolvedValue(null);
        const result = await getApprovedStudyByID('notfound');
        expect(result).toBeNull();
        expect(prisma.approvedStudy.findUnique).toHaveBeenCalledWith({ where: { id: 'notfound' } });
    });
}); 