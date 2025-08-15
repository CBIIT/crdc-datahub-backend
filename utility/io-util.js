const fs = require("fs");
const archiver = require('archiver');

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
/**
 * zipFilesInDir
 * @param {*} dirPath 
 * @param {*} zipFilePath 
 */
async function zipFilesInDir(dirPath, zipFilePath) {
    const output = fs.createWriteStream(zipFilePath);
    if (!output) return false;
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    // Add all files in the temp folder to the zip archive
    archive.directory(dirPath, false);
    await archive.finalize();
    return true
}
/**
 * makeDir
 * @param {*} dirPath 
 */
function makeDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Convert an array of objects to a TSV (Tab-Separated Values) string and write it to a file.
 * @param {Array} data - An array of objects to be converted to TSV.
 * @param {string} filename - The name of the output file.
 * @throws {Error} If the input is not an array or is empty.
 */
function arrayOfObjectsToTSV(array, filename, columns = null) {
  if (!Array.isArray(array) || array.length === 0) {
    console.error('Input must be a non-empty array');
    return;
  }

  // Extract headers from the first object
  const headers = columns || Object.keys(array[0]);
  // Create a string for the headers
  const headerString = headers.join('\t') + '\n';

  // Create an array to hold the data rows
  const dataRows = array.map(obj => {
    return headers.map(header => {
      // Handle potential null or undefined values
      return obj[header] !== null && obj[header] !== undefined ? obj[header].toString() : '';
    }).join('\t');
  }).join('\n');

  // Combine headers and data rows
  const tsvString = headerString + dataRows;

  // Write the TSV string to a file
  fs.writeFileSync(filename, tsvString, 'utf8');

  console.log(`Data has been written to ${filename}`);
}

module.exports = {
    readFile2Text,
    write2file, 
    writeObject2JsonFile,
    readJsonFile2Object,
    zipFilesInDir,
    makeDir,
    arrayOfObjectsToTSV
}

