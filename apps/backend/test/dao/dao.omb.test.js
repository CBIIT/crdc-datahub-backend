const getOMBConfiguration = require('../../dao/omb');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    configuration: {
        findFirst: jest.fn(),
    },
}));

describe('getOMBConfiguration', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return OMB configuration with _id field when found', async () => {
        const mockConfig = { id: 'omb123', type: 'OMB_INFO', OMBNumber: '123' };
        prisma.configuration.findFirst.mockResolvedValue(mockConfig);
        const result = await getOMBConfiguration();
        expect(prisma.configuration.findFirst).toHaveBeenCalledWith({ where: { type: 'OMB_INFO' } });
        expect(result).toEqual({ ...mockConfig, _id: mockConfig.id });
    });

    it('should return null when OMB configuration not found', async () => {
        prisma.configuration.findFirst.mockResolvedValue(null);
        const result = await getOMBConfiguration();
        expect(prisma.configuration.findFirst).toHaveBeenCalledWith({ where: { type: 'OMB_INFO' } });
        expect(result).toBeNull();
    });
});