const fs = require('fs');
const path = require('path');
const { TooltipService } = require('../../services/tooltip-service');
const { verifySession } = require('../../verifier/user-info-verifier');
const ERROR = require('../../constants/error-constants');

jest.mock('fs');
jest.mock('path');
jest.mock('../../verifier/user-info-verifier');

// Test constants - only valid tooltip keys
const TOOLTIP_KEYS = {
    WELCOME_MESSAGE: 'WELCOME_MESSAGE',
    SUBMIT_BUTTON: 'SUBMIT_BUTTON',
    VALIDATE_BUTTON: 'VALIDATE_BUTTON'
};

const TOOLTIP_VALUES = {
    WELCOME_MESSAGE: 'Welcome to the CRDC Data Hub',
    SUBMIT_BUTTON: 'Submit your data submission',
    VALIDATE_BUTTON: 'Validate submission data'
};

    describe('TooltipService', () => {
    let mockConstantsPath;
    let mockConstants;
    let mockContext;
    let mockVerifySession;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockConstantsPath = '/path/to/constants/tooltip-constants.json';
        mockConstants = {
            [TOOLTIP_KEYS.WELCOME_MESSAGE]: TOOLTIP_VALUES.WELCOME_MESSAGE,
            [TOOLTIP_KEYS.SUBMIT_BUTTON]: TOOLTIP_VALUES.SUBMIT_BUTTON,
            [TOOLTIP_KEYS.VALIDATE_BUTTON]: TOOLTIP_VALUES.VALIDATE_BUTTON
        };

        // Mock context with userInfo
        mockContext = {
            userInfo: {
                _id: 'user123',
                email: 'test@example.com',
                IDP: 'NIH'
            }
        };

        // Mock verifySession
        mockVerifySession = {
            verifyInitialized: jest.fn().mockReturnThis()
        };
        verifySession.mockReturnValue(mockVerifySession);

        // Mock path.join to return our test path
        path.join.mockImplementation((...args) => {
            return args.join('/');
        });

        // Mock fs.readFileSync to return valid JSON by default
        fs.readFileSync.mockReturnValue(JSON.stringify(mockConstants));
    });

    describe('constructor', () => {
        it('should successfully load constants file on initialization', () => {
            const service = new TooltipService();
            expect(service.constants).toEqual(mockConstants);
            expect(fs.readFileSync).toHaveBeenCalled();
        });

        it('should throw error when constants file is missing', () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            expect(() => new TooltipService()).toThrow(`${ERROR.TOOLTIP_SERVICE.INITIALIZATION_FAILED}ENOENT: no such file or directory`);
        });

        it('should throw error when constants file contains invalid JSON', () => {
            fs.readFileSync.mockReturnValue('invalid json {');

            expect(() => new TooltipService()).toThrow(new RegExp(ERROR.TOOLTIP_SERVICE.INITIALIZATION_FAILED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        });

        it('should throw error when constants file contains non-string value', () => {
            const invalidConstants = {
                ...mockConstants,
                INVALID_KEY: 123
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidConstants));

            expect(() => new TooltipService()).toThrow(new RegExp(ERROR.TOOLTIP_SERVICE.VALIDATION_FAILED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            expect(() => new TooltipService()).toThrow(new RegExp(`${ERROR.TOOLTIP_SERVICE.NON_STRING_VALUES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}INVALID_KEY`));
        });

        it('should throw error when constants file contains multiple non-string values', () => {
            const invalidConstants = {
                ...mockConstants,
                INVALID_KEY_1: 123,
                INVALID_KEY_2: true,
                INVALID_KEY_3: {}
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidConstants));

            expect(() => new TooltipService()).toThrow(new RegExp(ERROR.TOOLTIP_SERVICE.VALIDATION_FAILED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            expect(() => new TooltipService()).toThrow(new RegExp(`${ERROR.TOOLTIP_SERVICE.NON_STRING_VALUES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}INVALID_KEY_1, INVALID_KEY_2, INVALID_KEY_3`));
        });

        it('should throw error when constants file is not an object', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify([]));

            expect(() => new TooltipService()).toThrow(ERROR.TOOLTIP_SERVICE.INVALID_JSON_OBJECT);
        });

        it('should throw error when constants file is null', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify(null));

            expect(() => new TooltipService()).toThrow(ERROR.TOOLTIP_SERVICE.INVALID_JSON_OBJECT);
        });

        it('should throw error when constants file contains null values', () => {
            const constantsWithNull = {
                ...mockConstants,
                NULL_KEY: null
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(constantsWithNull));

            expect(() => new TooltipService()).toThrow(new RegExp(ERROR.TOOLTIP_SERVICE.VALIDATION_FAILED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            expect(() => new TooltipService()).toThrow(new RegExp(`${ERROR.TOOLTIP_SERVICE.NON_STRING_VALUES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}NULL_KEY`));
        });
    });

    describe('getTooltips', () => {
        let service;

        beforeEach(() => {
            service = new TooltipService();
        });

        it('should call verifySession and verifyInitialized', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE]
            };

            await service.getTooltips(params, mockContext);

            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(mockVerifySession.verifyInitialized).toHaveBeenCalled();
        });

        it('should log to stdout with user information', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE]
            };
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await service.getTooltips(params, mockContext);

            expect(consoleSpy).toHaveBeenCalledWith('getTooltips called by user: user123');
            consoleSpy.mockRestore();
        });

        it('should return tooltips for existing keys', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.SUBMIT_BUTTON]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON }
            ]);
        });

        it('should return null for non-existent keys', async () => {
            const params = {
                keys: ['NON_EXISTENT_KEY']
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: 'NON_EXISTENT_KEY', value: null }
            ]);
        });

        it('should handle mix of existing and non-existent keys', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE, 'NON_EXISTENT_KEY', TOOLTIP_KEYS.VALIDATE_BUTTON]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: 'NON_EXISTENT_KEY', value: null },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]);
        });

        it('should handle single key request', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.SUBMIT_BUTTON]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON }
            ]);
        });

        it('should preserve order of requested keys', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.VALIDATE_BUTTON, TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.SUBMIT_BUTTON]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON },
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON }
            ]);
        });

        it('should return all tooltips when params is undefined', async () => {
            const result = await service.getTooltips(undefined, mockContext);
            
            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]));
        });

        it('should return all tooltips when params is null', async () => {
            const result = await service.getTooltips(null, mockContext);
            
            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]));
        });

        it('should return all tooltips when params.keys is undefined', async () => {
            const result = await service.getTooltips({}, mockContext);
            
            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]));
        });

        it('should return all tooltips when params.keys is not an array', async () => {
            const result = await service.getTooltips({ keys: 'not-an-array' }, mockContext);
            
            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]));
        });

        it('should return all tooltips when params.keys is an empty array', async () => {
            const result = await service.getTooltips({ keys: [] }, mockContext);
            
            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON },
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON }
            ]));
        });

        it('should return unique keys only once when duplicates are in request', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.SUBMIT_BUTTON]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON }
            ]);
        });

        it('should throw error when keys array exceeds maximum limit', async () => {
            const largeKeysArray = Array(101).fill(TOOLTIP_KEYS.WELCOME_MESSAGE);
            
            await expect(service.getTooltips({ keys: largeKeysArray }, mockContext)).rejects.toThrow(
                `${ERROR.TOOLTIP_SERVICE.KEYS_ARRAY_EXCEEDS_LIMIT} 100 items.`
            );
        });

        it('should accept keys array at the maximum limit', async () => {
            const maxKeysArray = Array(100).fill(TOOLTIP_KEYS.WELCOME_MESSAGE);
            
            const result = await service.getTooltips({ keys: maxKeysArray }, mockContext);
            
            // Should only return one unique key
            expect(result).toEqual([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE }
            ]);
        });

        it('should preserve order of first occurrence when removing duplicates', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.VALIDATE_BUTTON, TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.VALIDATE_BUTTON, TOOLTIP_KEYS.SUBMIT_BUTTON, TOOLTIP_KEYS.WELCOME_MESSAGE]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.VALIDATE_BUTTON, value: TOOLTIP_VALUES.VALIDATE_BUTTON },
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE },
                { key: TOOLTIP_KEYS.SUBMIT_BUTTON, value: TOOLTIP_VALUES.SUBMIT_BUTTON }
            ]);
        });

        it('should return single result when all keys are duplicates', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.WELCOME_MESSAGE, TOOLTIP_KEYS.WELCOME_MESSAGE]
            };

            const result = await service.getTooltips(params, mockContext);

            expect(result).toEqual([
                { key: TOOLTIP_KEYS.WELCOME_MESSAGE, value: TOOLTIP_VALUES.WELCOME_MESSAGE }
            ]);
            expect(result.length).toBe(1);
        });

        it('should throw error when context is missing', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE]
            };

            verifySession.mockImplementation(() => {
                throw new Error(ERROR.NOT_LOGGED_IN);
            });

            await expect(service.getTooltips(params, null)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
        });

        it('should throw error when userInfo._id is missing', async () => {
            const params = {
                keys: [TOOLTIP_KEYS.WELCOME_MESSAGE]
            };

            mockVerifySession.verifyInitialized.mockImplementation(() => {
                throw new Error(ERROR.SESSION_NOT_INITIALIZED);
            });

            await expect(service.getTooltips(params, mockContext)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
        });
    });
});

