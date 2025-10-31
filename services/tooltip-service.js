const fs = require("fs");
const path = require("path");

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
            this.constants = JSON.parse(fileContent);
        } catch (error) {
            console.error("Failed to load tooltip constants during initialization:", error);
            throw new Error(`Failed to initialize TooltipService: ${error.message}`);
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
            throw new Error("The 'keys' parameter is required and must be a non-empty array of strings.");
        }
        
        if (params.keys.length > MAX_KEYS_LIMIT) {
            throw new Error(`The 'keys' array cannot exceed ${MAX_KEYS_LIMIT} items.`);
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

