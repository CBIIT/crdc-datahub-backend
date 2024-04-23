const https = require("https");
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
}

module.exports = {UtilityService}