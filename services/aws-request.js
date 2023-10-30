const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const {verifyApiToken,verifySubmitter} = require("../verifier/user-info-verifier");
const path = require("path");
const config = require('../config');

const S3_GET = 'getObject';
const S3_KEY = 'Key';
const S3_SIZE= 'Size'
const S3_CONTENTS = 'Contents'
/**
 * This class provides services for aWS requests
 */
class AWSService {
    constructor(submissionCollection, userService, sqsLoaderQueue) {
        this.userService = userService;
        this.submissions = submissionCollection;
        this.s3 = new AWS.S3();
        this.sqs = new AWS.SQS();
        this.sqsLoaderQueue = sqsLoaderQueue
    }
    /**
     * createTempCredentials
     * @param {*} context 
     * @param {*} submissionID 
     * @returnsv {
            accessKeyId: String
            secretAccessKey: String
            sessionToken: String
        }
     */
    async createTempCredentials(params, context) {
        //1. verify token and decode token to get user info
        const userInfo = verifyApiToken(context, config.session_secret);
        //verify submitter
        await verifySubmitter(userInfo, params?.submissionID, this.submissions, this.userService);
        //2. create temp credential
        // Initialize an STS object
        const sts = new AWS.STS();
        const timestamp = (new Date()).getTime();
        const s3Params = {
            RoleArn: config.role_arn,
            RoleSessionName: `Temp_Session_${timestamp}`
        };
        return new Promise((resolve, reject) => {
            
            sts.assumeRole(s3Params, (err, data) => {
                if (err) reject(err);
                else {
                    resolve({
                        accessKeyId: data.Credentials.AccessKeyId,
                        secretAccessKey: data.Credentials.SecretAccessKey,
                        sessionToken: data.Credentials.SessionToken,
                    });
                }
            });
        });
    }
    /**
     * getLastFileFromS3
     * @param {*} bucket s3 bucket name
     * @param {*} prefix s3 bucket file prefix
     * @returns file
     */
    async  getLastFileFromS3(bucket, prefix, uploadType, filter){

        const data = await this.s3.listObjects(getS3Params(bucket, prefix)).promise();
        const files = data[S3_CONTENTS].filter(k=>k[S3_KEY].indexOf(filter)> 0)
        if(files.length > 0)
        {
            const lastFile = files[files.length-1];
            let key = lastFile[S3_KEY];
            let fileName = path.basename(key);
            let downloadUrl = await this.createDownloadURL(bucket, key);
            let size = lastFile[S3_SIZE];
            return {fileName: fileName, uploadType: uploadType, downloadUrl: downloadUrl, fileSize: size};
        }
        else return null;
    }
    /**
     * createDownloadURL
     * @param {*} bucketName 
     * @param {*} key 
     * @returns url as string 
     */
    async  createDownloadURL(bucketName, key) {
        const params = {
            Bucket: bucketName,
            Key: `${key}`,
            Expires: config.presign_expiration, 
        };
        return new Promise((resolve, reject) => {
            this.s3.getSignedUrl(S3_GET, params, (error, url) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(url);
                }
            });
        });  
    }

    /**
     * sends a message to AWS SQS queue.
     *
     * @param {Object} messageBody - The message body to be sent.
     * @returns {Promise} - Resolves with the data from SQS if successful, rejects with an error otherwise.
     */
    async sendSQSMessage(messageBody) {
        const params = {
            MessageBody: JSON.stringify(messageBody),
            QueueUrl: this.sqsLoaderQueue
        }
        return new Promise((resolve, reject) => {
            this.sqs.sendMessage(params, (err, data) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(data);
                }
            });
        });
    }
    
}

function getS3Params(bucket, prefix){
    return {
        Bucket: bucket,
        Delimiter: '/',
        Prefix: `${prefix}/`
    };
}
module.exports = {
    AWSService
};


