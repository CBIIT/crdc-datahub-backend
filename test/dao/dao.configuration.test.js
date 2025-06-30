const ConfigurationDAO = require('../../dao/configuration');

describe('ConfigurationDAO.findByType', () => {
    let dao;

    beforeEach(() => {
        dao = new ConfigurationDAO();
    });

    it('should return config with _id when found', async () => {
        const mockConfig = { id: 1, type: 'test', value: 'abc' };
        dao.findFirst = jest.fn().mockResolvedValue(mockConfig);

        const result = await dao.findByType('test');

        expect(dao.findFirst).toHaveBeenCalledWith({ where: { type: 'test' } });
        expect(result).toEqual({ ...mockConfig, _id: mockConfig.id });
    });

    it('should return null when config not found', async () => {
        dao.findFirst = jest.fn().mockResolvedValue(null);

        const result = await dao.findByType('missing');

        expect(dao.findFirst).toHaveBeenCalledWith({ where: { type: 'missing' } });
        expect(result).toBeNull();
    });
});