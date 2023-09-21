const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const fs = require('fs');
const path = require('path');
const currentFilePath = __filename; // Path to the current JavaScript file
const currentDirectory = path.dirname(currentFilePath);

const bucketName = "crdcdh-test-submission";
const roleARN = 'arn:aws:iam::420434175168:role/crdcdh-test-submission';
const fileNames = 'save-application.test.js'


describe('sts credential test', () => {
    test("session errors", async () => {
        // Initialize an STS object
        const sts = new AWS.STS();
        // Define the role ARN that you want to assume
        const assumeRoleParams = {
            RoleArn: roleARN,
            RoleSessionName: 'TemporarySession'
        };
        // Assume the role
        sts.assumeRole(assumeRoleParams, (err, data) => {
            if (err) {
                console.error('Error assuming role:', err);
            } else {
                // Use the temporary credentials
                const tempCredentials = new AWS.Credentials({
                    accessKeyId: data.Credentials.AccessKeyId,
                    secretAccessKey: data.Credentials.SecretAccessKey,
                    sessionToken: data.Credentials.SessionToken
                });

                // Create an AWS service object using the temporary credentials
                const s3 = new AWS.S3({ credentials: tempCredentials });
                const localFilePath = path.join(currentDirectory, fileNames);
                const uploadParams = {
                    Bucket: bucketName,
                    Key: "test/" + fileNames, // Corrected object key in S3 (full path)
                    Body: fs.createReadStream(localFilePath)
                };

                s3.upload(uploadParams, (err, uploadData) => {
                    if (err) {
                        console.error('Error uploading:', err);
                        return;
                    }
                    console.log('File uploaded successfully!');
                });
            }
        });
    });
});