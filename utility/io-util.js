const fs = require("fs");

/**
 * util func: read text file to string
 * @param {*} filePath 
 * @returns 
 */
function readFile2Text(filePath) {
    return (fs.existsSync(filePath))? fs.readFileSync(filePath, "utf-8"): null;
}
/**
 * write string to text file
 * @param {*} text 
 * @param {*} filePath 
 */
function write2file(text, filePath) {
    fs.writeFileSync(filePath, text);
}

/**
 * writeArray2JsonFile
 * @param {*} array 
 * @param {*} filePath 
 */
function writeObject2JsonFile(array, filePath) {
    const json = JSON.stringify(array);
    write2file(json, filePath);
}

/**
 * readJsonFile2Array
 * @param {*} filePath 
 * @returns 
 */
function readJsonFile2Object(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const json = readFile2Text(filePath);
    return JSON.parse(json);
}

module.exports = {
    readFile2Text,
    write2file, 
    writeObject2JsonFile,
    readJsonFile2Object
}

