const fs = require('fs');
const path = require('path');
const { TooltipService } = require('../../services/tooltip-service');

jest.mock('fs');
jest.mock('path');

describe('TooltipService', () => {
    let mockConstantsPath;
    let mockConstants;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockConstantsPath = '/path/to/constants/tooltip-constants.json';
        mockConstants = {
            WELCOME_MESSAGE: "Welcome to the CRDC Data Hub",
            SUBMIT_BUTTON: "Submit your data submission",
            VALIDATE_BUTTON: "Validate submission data"
        };

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

            expect(() => new TooltipService()).toThrow('Failed to initialize TooltipService: ENOENT: no such file or directory');
        });

        it('should throw error when constants file contains invalid JSON', () => {
            fs.readFileSync.mockReturnValue('invalid json {');

            expect(() => new TooltipService()).toThrow(/Failed to initialize TooltipService/);
        });

        it('should throw error when constants file contains non-string value', () => {
            const invalidConstants = {
                ...mockConstants,
                INVALID_KEY: 123
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidConstants));

            expect(() => new TooltipService()).toThrow(/Constants file validation failed/);
            expect(() => new TooltipService()).toThrow(/non-string values for keys: INVALID_KEY/);
        });

        it('should throw error when constants file contains multiple non-string values', () => {
            const invalidConstants = {
                ...mockConstants,
                INVALID_KEY_1: 123,
                INVALID_KEY_2: true,
                INVALID_KEY_3: {}
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(invalidConstants));

            expect(() => new TooltipService()).toThrow(/Constants file validation failed/);
            expect(() => new TooltipService()).toThrow(/non-string values for keys: INVALID_KEY_1, INVALID_KEY_2, INVALID_KEY_3/);
        });

        it('should throw error when constants file is not an object', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify([]));

            expect(() => new TooltipService()).toThrow(/Constants file must contain a valid JSON object/);
        });

        it('should throw error when constants file is null', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify(null));

            expect(() => new TooltipService()).toThrow(/Constants file must contain a valid JSON object/);
        });

        it('should throw error when constants file contains null values', () => {
            const constantsWithNull = {
                ...mockConstants,
                NULL_KEY: null
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(constantsWithNull));

            expect(() => new TooltipService()).toThrow(/Constants file validation failed/);
            expect(() => new TooltipService()).toThrow(/non-string values for keys: NULL_KEY/);
        });
    });

    describe('getTooltips', () => {
        let service;

        beforeEach(() => {
            service = new TooltipService();
        });

        it('should return tooltips for existing keys', () => {
            const params = {
                keys: ['WELCOME_MESSAGE', 'SUBMIT_BUTTON']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' },
                { key: 'SUBMIT_BUTTON', value: 'Submit your data submission' }
            ]);
        });

        it('should return null for non-existent keys', () => {
            const params = {
                keys: ['NON_EXISTENT_KEY']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'NON_EXISTENT_KEY', value: null }
            ]);
        });

        it('should handle mix of existing and non-existent keys', () => {
            const params = {
                keys: ['WELCOME_MESSAGE', 'NON_EXISTENT_KEY', 'VALIDATE_BUTTON']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' },
                { key: 'NON_EXISTENT_KEY', value: null },
                { key: 'VALIDATE_BUTTON', value: 'Validate submission data' }
            ]);
        });

        it('should handle single key request', () => {
            const params = {
                keys: ['SUBMIT_BUTTON']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'SUBMIT_BUTTON', value: 'Submit your data submission' }
            ]);
        });

        it('should preserve order of requested keys', () => {
            const params = {
                keys: ['VALIDATE_BUTTON', 'WELCOME_MESSAGE', 'SUBMIT_BUTTON']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'VALIDATE_BUTTON', value: 'Validate submission data' },
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' },
                { key: 'SUBMIT_BUTTON', value: 'Submit your data submission' }
            ]);
        });

        it('should throw error when params is undefined', () => {
            expect(() => service.getTooltips(undefined)).toThrow(
                "The 'keys' parameter is required and must be a non-empty array of strings."
            );
        });

        it('should throw error when params is null', () => {
            expect(() => service.getTooltips(null)).toThrow(
                "The 'keys' parameter is required and must be a non-empty array of strings."
            );
        });

        it('should throw error when params.keys is undefined', () => {
            expect(() => service.getTooltips({})).toThrow(
                "The 'keys' parameter is required and must be a non-empty array of strings."
            );
        });

        it('should throw error when params.keys is not an array', () => {
            expect(() => service.getTooltips({ keys: 'not-an-array' })).toThrow(
                "The 'keys' parameter is required and must be a non-empty array of strings."
            );
        });

        it('should throw error when params.keys is an empty array', () => {
            expect(() => service.getTooltips({ keys: [] })).toThrow(
                "The 'keys' parameter is required and must be a non-empty array of strings."
            );
        });

        it('should throw error when keys array exceeds maximum limit', () => {
            const largeKeysArray = Array(101).fill('WELCOME_MESSAGE');
            
            expect(() => service.getTooltips({ keys: largeKeysArray })).toThrow(
                "The 'keys' array cannot exceed 100 items."
            );
        });

        it('should accept keys array at the maximum limit', () => {
            const maxKeysArray = Array(100).fill('WELCOME_MESSAGE');
            
            const result = service.getTooltips({ keys: maxKeysArray });
            
            // Should only return one unique key
            expect(result).toEqual([
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' }
            ]);
        });


        it('should return unique keys only once when duplicates are in request', () => {
            const params = {
                keys: ['WELCOME_MESSAGE', 'WELCOME_MESSAGE', 'SUBMIT_BUTTON']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' },
                { key: 'SUBMIT_BUTTON', value: 'Submit your data submission' }
            ]);
        });

        it('should preserve order of first occurrence when removing duplicates', () => {
            const params = {
                keys: ['VALIDATE_BUTTON', 'WELCOME_MESSAGE', 'VALIDATE_BUTTON', 'SUBMIT_BUTTON', 'WELCOME_MESSAGE']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'VALIDATE_BUTTON', value: 'Validate submission data' },
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' },
                { key: 'SUBMIT_BUTTON', value: 'Submit your data submission' }
            ]);
        });

        it('should return single result when all keys are duplicates', () => {
            const params = {
                keys: ['WELCOME_MESSAGE', 'WELCOME_MESSAGE', 'WELCOME_MESSAGE']
            };

            const result = service.getTooltips(params);

            expect(result).toEqual([
                { key: 'WELCOME_MESSAGE', value: 'Welcome to the CRDC Data Hub' }
            ]);
            expect(result.length).toBe(1);
        });
    });
});

