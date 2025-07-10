const CdeDAO = require('../../dao/cde');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    cDE: {
        findMany: jest.fn(),
    },
}));

describe('CdeDAO.getCdeByCodeAndVersion', () => {
    let cdeDAO;

    beforeEach(() => {
        cdeDAO = new CdeDAO();
        jest.clearAllMocks();
    });

    it('should return an empty array if no documents are found', async () => {
        prisma.cDE.findMany.mockResolvedValue([]);
        const result = await cdeDAO.getCdeByCodeAndVersion([{ CDECode: 'X' }]);
        expect(result).toEqual([]);
    });

    it('should handle a single CDECode with multiple versions', async () => {
        const mockDocs = [
            { id: 10, CDECode: 'C', CDEVersion: 5 },
            { id: 11, CDECode: 'C', CDEVersion: 4 },
        ];
        prisma.cDE.findMany.mockResolvedValue(mockDocs);

        const result = await cdeDAO.getCdeByCodeAndVersion([{ CDECode: 'C' }]);
        expect(result).toEqual([
            { id: 10, CDECode: 'C', CDEVersion: 5, _id: 10 }
        ]);
    });

    it('should map _id to id in the result', async () => {
        const mockDocs = [
            { id: 42, CDECode: 'D', CDEVersion: 1 },
        ];
        prisma.cDE.findMany.mockResolvedValue(mockDocs);

        const result = await cdeDAO.getCdeByCodeAndVersion([{ CDECode: 'D' }]);
        expect(result[0]._id).toBe(42);
    });
});