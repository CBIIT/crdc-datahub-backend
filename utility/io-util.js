const fs = require("fs");
const yaml = require('js-yaml');

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
 * loadYamlFile2Object
 * @param {*} filePath 
 * @returns 
 */
function loadYamlFile2Object(filePath) {
    return (fs.existsSync(filePath))? yaml.load(fs.readFileSync(filePath, 'utf8')) : null;
}

module.exports = {
    readFile2Text,
    write2file, 
    loadYamlFile2Object
}

