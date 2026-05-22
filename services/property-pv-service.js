const { replaceErrorString } = require("../utility/string-util");
const ERROR = require("../constants/error-constants");

const DATA_COMMONS_LIST_TYPE = "DATA_COMMONS_LIST";
/** Limits $in query size and response size for retrievePVsByPropertyName. */
const MAX_RETRIEVE_PVS_PROPERTY_NAMES = 500;

// Extracts the semver version from the trimmed version string
// logic matches the transformation performed by MDB data ingestion
// https://github.com/CBIIT/bento-mdb/blob/f18dbf41ecb244c11fa22db10547f3337cbeeb60/scripts/check_new_mdfs.py#L27
function versionForPropertyPvQuery(trimmedVersion) {
    const m = trimmedVersion.match(/\d+\.\d+\.\d+/);
    return m ? m[0] : trimmedVersion;
}

// Verifies each element of the array is a non-empty string
// Trims the strings and removes duplicates while maintaining order
// Returns an array of unique, trimmed, ordered, non-empty strings
function normalizePropertyNames(propertyNames) {
    if (!Array.isArray(propertyNames)) {
        throw new Error(ERROR.RETRIEVE_PVS_INVALID_PROPERTY_NAME);
    }
    if (propertyNames.length > MAX_RETRIEVE_PVS_PROPERTY_NAMES) {
        throw new Error(ERROR.RETRIEVE_PVS_TOO_MANY_PROPERTY_NAMES);
    }
    const trimmed = [];
    for (const name of propertyNames) {
        if (typeof name !== "string" || !name.trim()) {
            throw new Error(ERROR.RETRIEVE_PVS_INVALID_PROPERTY_NAME);
        }
        trimmed.push(name.trim());
    }
    const seen = new Set();
    const uniqueOrdered = [];
    for (const t of trimmed) {
        if (!seen.has(t)) {
            seen.add(t);
            uniqueOrdered.push(t);
        }
    }
    return uniqueOrdered;
}

class PropertyPVService {
    constructor(configurationService, propertyPVDAO) {
        this.configurationService = configurationService;
        this.propertyPVDAO = propertyPVDAO;
    }

    async retrievePVsByPropertyName(params) {
        const { propertyNames, model, version } = params;
        const uniqueOrderedNames = normalizePropertyNames(propertyNames);
        if (typeof version !== "string" || !version.trim()) {
            throw new Error(ERROR.RETRIEVE_PVS_INVALID_VERSION);
        }
        if (typeof model !== "string" || !model.trim()) {
            throw new Error(ERROR.RETRIEVE_PVS_INVALID_MODEL);
        }
        const versionTrimmed = version.trim();
        const versionForQuery = versionForPropertyPvQuery(versionTrimmed);
        const modelTrimmed = model.trim();
        const listDoc = await this.configurationService.findByType(DATA_COMMONS_LIST_TYPE);
        const allowed = listDoc?.key || [];
        if (!allowed.includes(modelTrimmed)) {
            const acceptedList = allowed.length ? [...allowed].sort().join(", ") : "(none configured)";
            throw new Error(
                replaceErrorString(
                    replaceErrorString(ERROR.INVALID_DATA_MODEL_NOT_ALLOWED, `'${modelTrimmed}'`),
                    acceptedList,
                    /\$accepted\$/g
                )
            );
        }
        if (uniqueOrderedNames.length === 0) {
            return [];
        }
        const rows = await this.propertyPVDAO.findByPropertiesVersionAndModel(
            uniqueOrderedNames,
            versionForQuery,
            modelTrimmed
        );
        const byProperty = new Map();
        for (const row of rows) {
            if (!byProperty.has(row.property)) {
                byProperty.set(row.property, row);
            }
        }
        const results = [];
        for (const name of uniqueOrderedNames) {
            const doc = byProperty.get(name);
            if (doc) {
                results.push(doc);
            }
        }
        return results;
    }
}

module.exports = { PropertyPVService };
