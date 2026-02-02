const ConfigurationDAO = require('../../dao/configuration');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    configuration: {
        findFirst: jest.fn(),
    },
}));

describe('ConfigurationDAO.findByType', () => {
    let dao;

    beforeEach(() => {
        dao = new ConfigurationDAO();
        jest.clearAllMocks();
    });

    it('should return config with _id when found', async () => {
        const mockConfig = { id: 123, type: 'test', value: 'abc' };
        prisma.configuration.findFirst.mockResolvedValue(mockConfig);

        const result = await dao.findByType('test');

        expect(prisma.configuration.findFirst).toHaveBeenCalledWith({ where: { type: 'test' } });
        expect(result).toEqual({ ...mockConfig, _id: mockConfig.id });
    });

    it('should return null when config not found', async () => {
        prisma.configuration.findFirst.mockResolvedValue(null);

        const result = await dao.findByType('missing');

        expect(prisma.configuration.findFirst).toHaveBeenCalledWith({ where: { type: 'missing' } });
        expect(result).toBeNull();
    });
});