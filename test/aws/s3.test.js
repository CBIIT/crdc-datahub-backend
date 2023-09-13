const {AWS} = require("../../crdc-datahub-database-drivers/domain/aws");
const config = require("../../config");
const {S3Service} = require("../../crdc-datahub-database-drivers/services/s3-service");
// const axios = require("axios");
// const path = require("path");
// const fs = require("fs");
describe('batch service API test', () => {

    test("create application", async () => {
        const s3Auth = AWS.s3(config.aws_access_id, config.aws_secret, config.aws_region);
        const s3Service = new S3Service(s3Auth);
        const preSignedURL = await s3Service.createPreSignedURL("sts-crdc-bucket", "test-submission", "test.txt");
        expect(preSignedURL).not.toBeNull();
    });

// Function to upload a file using a pre-signed URL
//     async function uploadFileWithURL(url, filePath) {
//         try {
//             const fileContent = fs.readFileSync(filePath);
//             const response = await axios.put(url, fileContent, {
//                 headers: {
//                     'Content-Type': 'application/octet-stream', // Set the content type as needed
//                 },
//             });
//             if (response.status === 200) {
//                 console.log('File uploaded successfully.');
//             } else {
//                 console.error('File upload failed with status:', response.status);
//             }
//         } catch (error) {
//             console.error('Error uploading file:', error.message);
//         }
//     }
});