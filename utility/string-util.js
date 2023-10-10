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
        input = input.replace(`$${key}`, messageVariables[key]);
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

async function getSubmisssionRootPath (submission, organizationService) {
    let rootPath = submission.rootPath;
    if(!rootPath){
        let orgId = null;
        if(typeof submission.organization != "string"){
            orgId =submission.organization._id
        }   
        else{
            const org = await organizationService.getOrganizationByName(submission.organization);
            orgId = org._id;
        }
            
        rootPath = `${orgId}/${submission._id}`;
    }
    return rootPath;
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
    getSubmisssionRootPath
}