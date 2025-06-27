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

    it('should return the latest version for each CDECode', async () => {
        const mockDocs = [
            { id: 1, CDECode: 'A', CDEVersion: 2 },
            { id: 2, CDECode: 'A', CDEVersion: 1 },
            { id: 3, CDECode: 'B', CDEVersion: 3 },
            { id: 4, CDECode: 'B', CDEVersion: 2 },
        ];
        prisma.cDE.findMany.mockResolvedValue(mockDocs);

        const query = [{ CDECode: 'A' }, { CDECode: 'B' }];
        const result = await cdeDAO.getCdeByCodeAndVersion(query);

        expect(prisma.cDE.findMany).toHaveBeenCalledWith({
            where: { OR: query },
            orderBy: [
                { CDECode: 'asc' },
                { CDEVersion: 'desc' }
            ]
        });

        expect(result).toEqual([
            { id: 1, CDECode: 'A', CDEVersion: 2, _id: 1 },
            { id: 3, CDECode: 'B', CDEVersion: 3, _id: 3 }
        ]);
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