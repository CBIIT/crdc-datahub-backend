const { ConfigurationService } = require('../../services/configurationService');
const { verifySession } = require('../../verifier/user-info-verifier');

jest.mock('../../verifier/user-info-verifier');
const mockVerifyInitialized = jest.fn();
verifySession.mockImplementation(() => ({
    verifyInitialized: mockVerifyInitialized,
}));

describe('ConfigurationService.getPBACDefaults', () => {
    let service;
    beforeEach(() => {
        service = new ConfigurationService();
        service.getPBACByRoles = jest.fn();
        mockVerifyInitialized.mockClear();
    });

    it('should call verifySession(context).verifyInitialized()', async () => {
        const params = { roles: ['Admin'] };
        const context = { user: 'test' };
        service.getPBACByRoles.mockResolvedValue([{ role: 'Admin' }]);
        await service.getPBACDefaults(params, context);
        expect(verifySession).toHaveBeenCalledWith(context);
        expect(mockVerifyInitialized).toHaveBeenCalled();
    });

    it('should call getPBACByRoles with params.roles', async () => {
        const params = { roles: ['User', 'Admin'] };
        const context = {};
        const expected = [{ role: 'User' }, { role: 'Admin' }];
        service.getPBACByRoles.mockResolvedValue(expected);
        const result = await service.getPBACDefaults(params, context);
        expect(service.getPBACByRoles).toHaveBeenCalledWith(params.roles);
        expect(result).toBe(expected);
    });

    it('should propagate errors from verifySession', async () => {
        const params = { roles: ['User'] };
        const context = {};
        mockVerifyInitialized.mockImplementation(() => { throw new Error('DB error'); });
        await expect(service.getPBACDefaults(params, context)).rejects.toThrow('DB error');
    });

    it('should propagate errors from getPBACByRoles', async () => {
        const params = { roles: ['User'] };
        const context = {};
        service.getPBACByRoles.mockRejectedValue(new Error('DB error'));
        await expect(service.getPBACDefaults(params, context)).rejects.toThrow('DB error');
    });
});