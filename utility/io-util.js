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

module.exports = {
    readFile2Text,
    write2file
}

