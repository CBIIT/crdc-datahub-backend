

function isCaseInsensitiveEqual(source, target) {
    if (!target || !source) return false;
    return source.toLowerCase() === target.toLowerCase();
}

function isElementInArray(array, target) {
    if (!array || !target) return false;
    return array.some((element) => element === target);
}

function isElementInArrayCaseInsensitive(array, target) {
    if (!array || !target) return false;
    return array.some((element) => element.toLowerCase() === target.toLowerCase());
}

const replaceErrorString = (original, replacement, pattern = /\$item\$/g) => {
   return (!original || !replacement) ? original : original.replace(pattern, replacement);
}

// For a MongoDB regex search, the dot '.' means any character in the keyword. It should be removed from the user-input.
const sanitizeMongoDBInput = (raw) => {
    if (!raw) return "";
    if (/^\.+$/.test(raw)) {
        return "''";
    }
    return raw.trim();
}


const getUniqueArr = (arr) => {return (arr) ? arr.filter((v, i, a) => a.indexOf(v) === i) : []};


// By default, a comma splitter
// Convert an array to string separated string
const parseArrToStr = (arr, splitter) => {
    if (!arr) return "";
    const result = arr.filter((e)=> e && e !== "").map((e)=> e);
    return result.join(splitter ? splitter : ",");
}

const isUndefined = (p) => {
    return p === undefined;
}

const replaceMessageVariables = (input, messageVariables) => {
    for (let key in messageVariables){
        // message variable must start with $
        const regex = new RegExp(`\\$${key}`, 'g');
        input = input.replace(regex, messageVariables[key]);
    }
    return input;
}

/**
 * Extracts and joins specified fields from an array of objects, joining values with a specified separator.
 *
 * @param {Array} data - The array of objects to extract fields from.
 * @param {Array} [fieldsToExtract] - An optional array of field names to extract. If not provided, all fields will be extracted.
 * @param {string} [splitter=','] - The separator used to join the extracted field values.
 * @returns {Array} An array of strings, where each string represents the joined values of the specified fields for each object.
 */
const extractAndJoinFields = (data, fieldsToExtract, splitter = ",") => {
    if (!data || data?.length === 0 || fieldsToExtract?.length === 0) return [];
    return data.map(org => fieldsToExtract
        .filter(key => org[key] && org[key] !== "")
        .map(key => org[key])
        .join(splitter)
    );
}

/**
 * Convert string to pascal case
 * @param {*} string 
 * @returns 
 */
const toPascalCase = (string) => {
    return `${string}`
      .toLowerCase()
      .replace(new RegExp(/[-_]+/, 'g'), ' ')
      .replace(new RegExp(/[^\w\s]/, 'g'), '')
      .replace(
        new RegExp(/\s+(.)(\w*)/, 'g'),
        ($1, $2, $3) => `${$2.toUpperCase() + $3}`
      )
      .replace(new RegExp(/\w/), s => s.toUpperCase());
}

/**
 * Ensuring it has a valid extension (with a dot and non-whitespace characters as a file extension)
 * @param {String} name
 * @returns
 */
const isValidFileExtension = (name) => {
    if (!name || (name?.trim()?.length === 0)) {
        return false;
    }
    const regex = /^\S+.*[.][A-Za-z0-9]+$/;
    return regex.test(name);
}


/**
 * Formats a given file size in bytes with appropriate units (KB, MB, GB, TB).
 *
 * @param {number} bytes - The file size in bytes (default is 0).
 * @returns {string} - The formatted file size with two decimal places.
 */
const fileSizeFormatter = (bytes = 0) => {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;

    let formattedSize = "0";

    if (bytes >= TB) {
        formattedSize = (bytes / TB).toFixed(2) + " TB";
    } else if (bytes >= GB) {
        formattedSize = (bytes / GB).toFixed(2) + " GB";
    } else if (bytes >= MB) {
        formattedSize = (bytes / MB).toFixed(2) + " MB";
    } else if (bytes > 0) {
        formattedSize = (bytes / KB).toFixed(2) + " KB";
    }

    // Apply thousands separator for readability
    return formattedSize.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const getFormatDateStr = (date, format="YYYYMMDD") => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    switch (format) {
        case "YYYYMMDD":
            return `${year}${month}${day}`;
        case "YYYYMMDDHHmmss":
            return `${year}${month}${day}${hours}${minutes}${seconds}`;
        default:
            return `${year}${month}${day}`;
    }
}

module.exports = {
    isCaseInsensitiveEqual,
    isElementInArray,
    isElementInArrayCaseInsensitive,
    isUndefined,
    getUniqueArr,
    parseArrToStr,
    replaceMessageVariables,
    extractAndJoinFields,
    toPascalCase,
    replaceErrorString,
    isValidFileExtension,
    fileSizeFormatter,
    getFormatDateStr,
    sanitizeMongoDBInput
}