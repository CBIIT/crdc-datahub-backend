const https = require("https");
const fs = require("fs");
class UtilityService {
    async fetchJsonFromUrl(url) {
        return new Promise((resolve, reject) => {
            // Validate URL
            if (!url) {
                reject(new Error("No URL provided when fetchJsonFromUrl"));
                return;
            }

            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        // Parse and resolve the data
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error("Failed to parse JSON data"));
                    }
                });
            }).on("error", (err) => {
                // Handle network errors
                reject(new Error("Unable to access the specified URL: " + err.message));
            });
        });
    }
    static async parseYamlFile(filePath){
        return (fs.existsSync(filePath))? fs.readFileSync(filePath, "utf-8"): null;
    }
}

module.exports = {UtilityService}