const fs = require("fs");
const path = require("path");
const ERROR = require("../constants/error-constants");

const MAX_KEYS_LIMIT = 100;

/**
 * Tooltip Service
 * @class TooltipService
 */
class TooltipService {
    constructor() {
        const constantsPath = path.join(__dirname, "../constants/tooltip-constants.json");
        
        try {
            const fileContent = fs.readFileSync(constantsPath, "utf8");
            const parsedConstants = JSON.parse(fileContent);
            
            // Validate that all keys and values are strings
            this._validateConstants(parsedConstants);
            
            this.constants = parsedConstants;
        } catch (error) {
            console.error("Failed to load tooltip constants during initialization:", error);
            throw new Error(`${ERROR.TOOLTIP_SERVICE.INITIALIZATION_FAILED}${error.message}`);
        }
    }

    /**
     * Validates that all keys and values in the constants object are strings
     * @param {Object} constants - The parsed constants object
     * @throws {Error} If validation fails
     * @private
     */
    _validateConstants(constants) {
        if (typeof constants !== 'object' || constants === null || Array.isArray(constants)) {
            const errorMsg = ERROR.TOOLTIP_SERVICE.INVALID_JSON_OBJECT;
            console.error(`Tooltip constants validation error: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const invalidKeys = [];
        const invalidValues = [];

        for (const [key, value] of Object.entries(constants)) {
            if (typeof key !== 'string') {
                invalidKeys.push(key);
            }
            if (typeof value !== 'string' || value === null) {
                invalidValues.push(key);
            }
        }

        if (invalidKeys.length > 0 || invalidValues.length > 0) {
            let errorMsg = ERROR.TOOLTIP_SERVICE.VALIDATION_FAILED;
            const errors = [];
            
            if (invalidKeys.length > 0) {
                errors.push(`${ERROR.TOOLTIP_SERVICE.NON_STRING_KEYS}${invalidKeys.join(', ')}`);
            }
            if (invalidValues.length > 0) {
                errors.push(`${ERROR.TOOLTIP_SERVICE.NON_STRING_VALUES}${invalidValues.join(', ')}`);
            }
            
            errorMsg += errors.join('; ');
            console.error(`Tooltip constants validation error: ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * API: getTooltips
     * @param {Object} params - Query parameters
     * @param {Array<String>} params.keys - Array of keys to lookup
     * @returns {Array<Object>} Array of objects with key and value properties
     */
    getTooltips(params) {
        if (!params?.keys || !Array.isArray(params.keys) || params.keys.length === 0) {
            throw new Error(ERROR.TOOLTIP_SERVICE.KEYS_PARAMETER_REQUIRED);
        }
        
        if (params.keys.length > MAX_KEYS_LIMIT) {
            throw new Error(`${ERROR.TOOLTIP_SERVICE.KEYS_ARRAY_EXCEEDS_LIMIT}${MAX_KEYS_LIMIT} items.`);
        }
        
        // Remove duplicate keys while preserving order
        const uniqueKeys = [...new Set(params.keys)];
        
        return uniqueKeys.map(key => {
            return {
                key: key,
                value: this.constants[key] ?? null
            };
        });
    }
}

module.exports = {
    TooltipService
};

