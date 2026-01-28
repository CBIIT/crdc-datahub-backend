const AuthenticationService = require('../../services/authentication-service');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');
const ERROR = require('../../constants/error-constants');
const jwt = require('jsonwebtoken');

// Mock the config module
jest.mock('../../config', () => ({
    token_secret: 'test-secret-key'
}));

describe('AuthenticationService.verifyAuthenticated', () => {
    let authenticationService;
    let mockUserCollection;
    const tokenSecret = 'test-secret-key';

    const mockUser = {
        _id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        tokens: []
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockUserCollection = {
            find: jest.fn()
        };

        authenticationService = new AuthenticationService(mockUserCollection);
    });

    describe('Token format compatibility', () => {
        describe('New token format (sub claim)', () => {
            it('should authenticate with new token format using sub claim', async () => {
                // Create a new format token with only sub claim
                const newFormatToken = jwt.sign({ sub: mockUser._id }, tokenSecret, { expiresIn: '1h' });
                const userWithToken = { ...mockUser, tokens: [newFormatToken] };

                mockUserCollection.find = jest.fn().mockResolvedValue([userWithToken]);

                const result = await authenticationService.verifyAuthenticated(
                    null,
                    `Bearer ${newFormatToken}`
                );

                expect(result).toEqual(userWithToken);
                expect(mockUserCollection.find).toHaveBeenCalledWith(mockUser._id);
            });

            it('should extract user ID from sub claim in new format token', async () => {
                const newFormatToken = jwt.sign({ sub: 'extracted-user-id' }, tokenSecret, { expiresIn: '1h' });
                const userWithToken = { ...mockUser, _id: 'extracted-user-id', tokens: [newFormatToken] };

                mockUserCollection.find = jest.fn().mockResolvedValue([userWithToken]);

                await authenticationService.verifyAuthenticated(null, `Bearer ${newFormatToken}`);

                expect(mockUserCollection.find).toHaveBeenCalledWith('extracted-user-id');
            });
        });

        describe('Legacy token format (_id claim) - Backwards compatibility', () => {
            it('should authenticate with legacy token format using _id claim', async () => {
                // Create a legacy format token with full user object (including _id)
                const legacyFormatToken = jwt.sign(
                    { _id: mockUser._id, email: mockUser.email, role: mockUser.role },
                    tokenSecret,
                    { expiresIn: '1h' }
                );
                const userWithToken = { ...mockUser, tokens: [legacyFormatToken] };

                mockUserCollection.find = jest.fn().mockResolvedValue([userWithToken]);

                const result = await authenticationService.verifyAuthenticated(
                    null,
                    `Bearer ${legacyFormatToken}`
                );

                expect(result).toEqual(userWithToken);
                expect(mockUserCollection.find).toHaveBeenCalledWith(mockUser._id);
            });

            it('should extract user ID from _id claim when sub is not present', async () => {
                const legacyFormatToken = jwt.sign(
                    { _id: 'legacy-user-id', email: 'test@example.com' },
                    tokenSecret,
                    { expiresIn: '1h' }
                );
                const userWithToken = { ...mockUser, _id: 'legacy-user-id', tokens: [legacyFormatToken] };

                mockUserCollection.find = jest.fn().mockResolvedValue([userWithToken]);

                await authenticationService.verifyAuthenticated(null, `Bearer ${legacyFormatToken}`);

                expect(mockUserCollection.find).toHaveBeenCalledWith('legacy-user-id');
            });
        });

        describe('Token format priority', () => {
            it('should prefer sub claim over _id when both are present', async () => {
                // Token with both sub and _id (sub should take precedence)
                const mixedToken = jwt.sign(
                    { sub: 'sub-user-id', _id: 'legacy-user-id' },
                    tokenSecret,
                    { expiresIn: '1h' }
                );
                const userWithToken = { ...mockUser, _id: 'sub-user-id', tokens: [mixedToken] };

                mockUserCollection.find = jest.fn().mockResolvedValue([userWithToken]);

                await authenticationService.verifyAuthenticated(null, `Bearer ${mixedToken}`);

                // Should use sub claim, not _id
                expect(mockUserCollection.find).toHaveBeenCalledWith('sub-user-id');
            });
        });
    });

    describe('Token validation errors', () => {
        it('should throw error when token has no user ID (neither sub nor _id)', async () => {
            const invalidToken = jwt.sign({ email: 'test@example.com' }, tokenSecret, { expiresIn: '1h' });

            await expect(
                authenticationService.verifyAuthenticated(null, `Bearer ${invalidToken}`)
            ).rejects.toThrow(ERROR.INVALID_TOKEN_NO_USER_ID);
        });

        it('should throw error when user ID does not exist in database', async () => {
            const validToken = jwt.sign({ sub: 'non-existent-user' }, tokenSecret, { expiresIn: '1h' });

            mockUserCollection.find = jest.fn().mockResolvedValue([]);

            await expect(
                authenticationService.verifyAuthenticated(null, `Bearer ${validToken}`)
            ).rejects.toThrow(ERROR.INVALID_TOKEN_INVALID_USER_ID);
        });

        it('should throw error when token is not in user whitelist', async () => {
            const validToken = jwt.sign({ sub: mockUser._id }, tokenSecret, { expiresIn: '1h' });
            const userWithDifferentToken = { ...mockUser, tokens: ['different-token'] };

            mockUserCollection.find = jest.fn().mockResolvedValue([userWithDifferentToken]);

            await expect(
                authenticationService.verifyAuthenticated(null, `Bearer ${validToken}`)
            ).rejects.toThrow(ERROR.INVALID_TOKEN_NOT_IN_WHITELIST);
        });

        it('should throw error when user is inactive', async () => {
            const validToken = jwt.sign({ sub: mockUser._id }, tokenSecret, { expiresIn: '1h' });
            const inactiveUser = { ...mockUser, userStatus: USER.STATUSES.INACTIVE, tokens: [validToken] };

            mockUserCollection.find = jest.fn().mockResolvedValue([inactiveUser]);

            await expect(
                authenticationService.verifyAuthenticated(null, `Bearer ${validToken}`)
            ).rejects.toThrow(ERROR.DISABLED_USER);
        });
    });

    describe('Session fallback', () => {
        it('should return userInfo when session exists and no token provided', async () => {
            const sessionUserInfo = {
                email: 'session@example.com',
                IDP: USER.IDPS.NIH
            };

            const result = await authenticationService.verifyAuthenticated(sessionUserInfo, '');

            expect(result).toEqual(sessionUserInfo);
            expect(mockUserCollection.find).not.toHaveBeenCalled();
        });

        it('should throw error when neither session nor token exists', async () => {
            await expect(
                authenticationService.verifyAuthenticated(null, '')
            ).rejects.toThrow(ERROR.INVALID_SESSION_OR_TOKEN);
        });
    });
});
