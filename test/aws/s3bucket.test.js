const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const fs = require('fs');
const path = require("path");
describe('s3 bucket API test', () => {

    test("list files in s3 bucket", async () => {
        const s3 = new AWS.S3();

        const params = {
            Bucket: 'crdcdh-test-submission',
            Delimiter: '/',
            Prefix: '6681e23e-c091-40b0-9dfe-b1e415d97cd7/9f42b5f1-5ea4-4923-a9bb-f496c63362ce' + '/file/log/'
        };

        const data = await s3.listObjects(params).promise();
        fileList = [];
        for (let index = 0; index < data['Contents'].length; index++) {
            console.log(data['Contents'][index]['Key']) 
                
        }
        fileList.push(data['Contents'][data['Contents'].length-1]['Key'])  

        //download file
        var s3Params = {
            Bucket: 'crdcdh-test-submission',
            Key: fileList[0]
        };
        s3.getObject(s3Params, function(err, res) {
            if (err === null) {
               res.attachment('file.ext'); // or whatever your logic needs
               res.send(data.Body);
            } else {
               res.status(500).send(err);
            }
        });
        
        expect(fileList[0]).not.toBeNull();
    });
});