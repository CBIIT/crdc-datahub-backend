function isCaseInsensitiveEqual(source, target) {
    if (!target || !source) return false;
    return source.toLowerCase() === target.toLowerCase();
}

function isElementInArray(array, target) {
    if (!array || !target) return false;
    return array.some((element) => element === target.toLowerCase());
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

module.exports = {
    isCaseInsensitiveEqual,
    isElementInArray,
    isElementInArrayCaseInsensitive,
    isUndefined,
    getUniqueArr,
    parseArrToStr,
    replaceMessageVariables
}