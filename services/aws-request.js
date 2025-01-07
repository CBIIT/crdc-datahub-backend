const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const {v4} = require('uuid');
const config = require('../config');
const ERROR = require("../constants/error-constants");

/**
 * This class provides services for aWS requests
 */
class AWSService {
    constructor(submissionCollection, userService) {
        this.userService = userService;
        this.submissions = submissionCollection;
        this.s3 = new AWS.S3();
        this.sqs = new AWS.SQS();
        this.sts = new AWS.STS();
        this.quicksight = new AWS.QuickSight();
    }
    /**
     * createTempCredentials
     * @param {*} submissionID
     * @return {Promise<Object>} {
            accessKeyId: String
            secretAccessKey: String
            sessionToken: String
        }
     */
    async createTempCredentials(submissionID) {
        const submission = (await this.submissions.find(submissionID) || []).pop();
        if(!submission.rootPath)
            throw new Error(`${ERROR.VERIFY.EMPTY_ROOT_PATH}, ${submissionID}!`);

        // create temp credential
        // Initialize an STS object
        const sts = new AWS.STS();
        const timestamp = (new Date()).getTime();
        //add s3 object access policy
        const policy = {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['s3:GetObject','s3:PutObject'],
                Resource: [`arn:aws:s3:::${submission.bucketName}/${submission.rootPath}/*`]
              }
            ]
          };
        const s3Params = {
            RoleArn: config.role_arn,
            RoleSessionName: `Temp_Session_${timestamp}`,
            Policy: JSON.stringify(policy)
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
     * sends a message to AWS SQS queue.
     *
     * @param {Object} messageBody - The message body to be sent.
     * @param groupID
     * @param deDuplicationId
     * @param queueName
     * @returns {Promise} - Resolves with the data from SQS if successful, rejects with an error otherwise.
     */
    async sendSQSMessage(messageBody,groupID, deDuplicationId, queueName) {
        const queueUrl = await getQueueUrl(this.sqs, queueName, messageBody);
        deDuplicationId = v4();
        const params = {
            MessageBody: JSON.stringify(messageBody),
            QueueUrl: queueUrl,
            MessageGroupId: groupID,
            MessageDeduplicationId: deDuplicationId
        }
        return new Promise((resolve, reject) => {
            this.sqs.sendMessage(params, (err, data) => {
                if (err) {
                    console.error(ERROR.FAILED_SQS_SEND, messageBody);
                    reject(err);
                }
                else {
                    resolve(data);
                }
            });
        });
    }


    /**
     * Generates an embed URL for a QuickSight dashboard.
     *
     * @param {string} dashboardID - The ID of the QuickSight dashboard to embed.
     * @param {number} sessionTimeout - The session timeout in seconds. Defaults to 60 minutes if not provided.
     * @returns {Promise<string>} - Resolves with the embed URL for the specified dashboard, or rejects with an error if the request fails.
     * @throws {Error} - Throws an error if the username is missing or invalid.
     */
    async getQuickInsightURL(dashboardID, sessionTimeout) {
        const accountID = await this.#getAccountID();
        const params = {
            AwsAccountId: accountID,
            DashboardId: dashboardID,
            IdentityType: 'ANONYMOUS',
            SessionLifetimeInMinutes: sessionTimeout / 60 || 60, // by default 60 minutes
            Namespace: `default`
        };
        return new Promise((resolve, reject) => {
            this.quicksight.getDashboardEmbedUrl(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data?.EmbedUrl);
                }
            });
        });
    }

    /**
     * Private function
     * Retrieves the AWS account ID of the caller.
     *
     * @returns {Promise<string>} - Resolves with the AWS account ID of the caller.
     * @throws {Error} - Throws an error if the request to retrieve the account ID fails.
     */
    async #getAccountID() {
        const data = await this.sts.getCallerIdentity({}).promise();
        return data.Account;
    }
}
const getQueueUrl = async (sqs, queueName, messageBody) => {
    return new Promise((resolve, reject) => {
        sqs.getQueueUrl({ QueueName: queueName }, (err, data) => {
            if (err) {
                console.error(ERROR.FAILED_SQS_SEND, messageBody);
                reject(err);
            } else {
                resolve(data.QueueUrl);
            }
        });
    });
}

module.exports = {
    AWSService
};


