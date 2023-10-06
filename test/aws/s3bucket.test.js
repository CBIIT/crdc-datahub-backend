const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const fs = require('fs');
const path = require("path");
describe('s3 bucket API test', () => {

    test("list files in s3 bucket", async () => {
        let fileList = [];
        const bucket='crdcdh-test-submission';
        const rootPath ='6681e23e-c091-40b0-9dfe-b1e415d97cd7/9f42b5f1-5ea4-4923-a9bb-f496c63362ce'
        const s3 = new AWS.S3();
        let uploadType = 'file';
        //get file upload log
        let params = getS3Params(bucket, rootPath, uploadType);
            
        let file = await getLogfile(s3, params, uploadType);
        if(file) fileList.push(file);

        //get metadata upload log
        uploadType = 'metadata';
        params = getS3Params(bucket, rootPath, uploadType);
        let file1 = await getLogfile(s3, params, uploadType);
        if(file1) fileList.push(file1);

        expect(fileList.length > 0).toBeTruthy();
    });

    function getS3Params(bucket, prefix, uploadType){
        var params = {
            Bucket: bucket,
            Delimiter: '/',
            Prefix: `${prefix}/${uploadType}/log/`
        };
    }

    async function getLogfile(s3, params, uploadType){
        const data = await s3.listObjects(params).promise();
        const files = data['Contents'].filter(k=>k['Key'].indexOf(".log")> 0)
        if(files.length > 0)
        {
            const lastFile = files[files.length-1];
            let key = lastFile['Key'];
            let fileName = path.basename(key);
            let downloadUrl = await createDownloadURL(s3, params.Bucket, key);
            let size = lastFile['Size'];
            return {fileName: fileName, uploadType: uploadType, downloadUrl: downloadUrl, size: size};
        }
        else return null;
    }


    async function createDownloadURL(s3, bucketName, key) {
        try {
            const params = {
                Bucket: bucketName,
                Key: `${key}`,
                Expires: 3600, // 1 hour
            };
            return new Promise((resolve, reject) => {
                s3.getSignedUrl('getObject', params, (error, url) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(url);
                    }
                });
            });
        } catch (error) {
            console.error('Error generating pre-signed URL:', error);
        }
    }
});