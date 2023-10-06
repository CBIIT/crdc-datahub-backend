const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const path = require("path");
const config = require('../config');
/**
 * This class provides services to list log files based on submission Id
 */
const UPLOAD_TYPES = {FILE: 'file', MEATDATA: 'metadata'};
const LOG_FILE_EXT ='.log';
const LOG_DIR = 'log';
const S3_GET = 'getObject';
const S3_KEY = 'Key';
const S3_SIZE= 'Size'
const S3_CONTENTS = 'Contents'

class LogService {
    constructor(bucket, rootPath){
        this.bucket = bucket;
        this.rootPath = rootPath;
    }
    /**
     * 
     * @param {*} params as objerct {} cotains submissisonID
     * @param {*} context 
     * @returns fileList []
     */
    async getLogList(){
        let fileList = [];
        const s3 = new AWS.S3();
        //get file upload log
        let params = this.getS3Params(UPLOAD_TYPES.FILE);   
        let file = await getLogfile(s3, params, UPLOAD_TYPES.FILE);
        if(file) fileList.push(file);

        //get metadata upload log
        params = this.getS3Params(UPLOAD_TYPES.MEATDATA);
        let file1 = await getLogfile(s3, params, UPLOAD_TYPES.MEATDATA);
        if(file1) fileList.push(file1);

        return fileList;
    }
   
    /**
     * Don't need based on analysis
     * @param {*} params as object {}  contains submissionID and file name
     * @returns file object
     */
    async downloadLog(params){
        let file = null;
        //to do
        //1) verify session
        //2) verify submitter
        //3) call aws s3 list objects based on the path.
        return file;
    }

    getS3Params(uploadType){
        return {
            Bucket: this.bucket,
            Delimiter: '/',
            Prefix: `${this.rootPath}/${uploadType}/${LOG_DIR}/`
        };
    }
}

async  function getLogfile(s3, params, uploadType){
    const data = await s3.listObjects(params).promise();
    const files = data[S3_CONTENTS].filter(k=>k[S3_KEY].indexOf(LOG_FILE_EXT)> 0)
    if(files.length > 0)
    {
        const lastFile = files[files.length-1];
        let key = lastFile[S3_KEY];
        let fileName = path.basename(key);
        let downloadUrl = await createDownloadURL(s3, params.Bucket, key);
        let size = lastFile[S3_SIZE];
        return {fileName: fileName, uploadType: uploadType, downloadUrl: downloadUrl, fileSize: size};
    }
    else return null;
}

async  function createDownloadURL(s3, bucketName, key) {
    let expiration = (config.presign_expration && /^[0-9]*$/.test(config.presign_expration))? 
        parseInt(config.presign_expration):3600; //defult value is 1 hour
    const params = {
        Bucket: bucketName,
        Key: `${key}`,
        Expires: expiration, 
    };
    return new Promise((resolve, reject) => {
        s3.getSignedUrl(S3_GET, params, (error, url) => {
            if (error) {
                reject(error);
            } else {
                resolve(url);
            }
        });
    });  
}


module.exports = {
    LogService
};

 