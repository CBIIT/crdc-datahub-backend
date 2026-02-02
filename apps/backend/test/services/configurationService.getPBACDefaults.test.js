const { ConfigurationService } = require('../../services/configurationService');
const { verifySession } = require('../../verifier/user-info-verifier');

jest.mock('../../verifier/user-info-verifier');
const mockVerifyInitialized = jest.fn();
verifySession.mockImplementation(() => ({
    verifyInitialized: mockVerifyInitialized,
}));

describe('ConfigurationService.getPBACDefaults', () => {
    let service;
    let mockContext;

    beforeEach(() => {
        service = new ConfigurationService();
        service.getPBACByRoles = jest.fn();
        mockVerifyInitialized.mockClear();
        
        mockContext = {
            userInfo: {
                _id: 'user123',
                email: 'test@example.com',
                IDP: 'NIH'
            }
        };
    });

    it('should call verifySession(context).verifyInitialized()', async () => {
        const params = { roles: ['Admin'] };
        service.getPBACByRoles.mockResolvedValue([{ role: 'Admin' }]);
        await service.getPBACDefaults(params, mockContext);
        expect(verifySession).toHaveBeenCalledWith(mockContext);
        expect(mockVerifyInitialized).toHaveBeenCalled();
    });

    it('should log to stdout with user information', async () => {
        const params = { roles: ['Admin'] };
        service.getPBACByRoles.mockResolvedValue([{ role: 'Admin' }]);
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        
        await service.getPBACDefaults(params, mockContext);
        
        expect(consoleSpy).toHaveBeenCalledWith('getPBACDefaults called by user: user123');
        consoleSpy.mockRestore();
    });

    it('should call getPBACByRoles with params.roles', async () => {
        const params = { roles: ['User', 'Admin'] };
        const expected = [{ role: 'User' }, { role: 'Admin' }];
        service.getPBACByRoles.mockResolvedValue(expected);
        const result = await service.getPBACDefaults(params, mockContext);
        expect(service.getPBACByRoles).toHaveBeenCalledWith(params.roles);
        expect(result).toBe(expected);
    });

    it('should propagate errors from verifySession', async () => {
        const params = { roles: ['User'] };
        mockVerifyInitialized.mockImplementation(() => { throw new Error('DB error'); });
        await expect(service.getPBACDefaults(params, mockContext)).rejects.toThrow('DB error');
    });

    it('should propagate errors from getPBACByRoles', async () => {
        const params = { roles: ['User'] };
        service.getPBACByRoles.mockRejectedValue(new Error('DB error'));
        await expect(service.getPBACDefaults(params, mockContext)).rejects.toThrow('DB error');
    });
});