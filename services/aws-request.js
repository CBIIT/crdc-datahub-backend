const AWS = require('aws-sdk');
const {verifyApiToken,verifySubmitter} = require("../verifier/user-info-verifier");
const config = require("../config");

class AWSService {
    constructor(submissionCollection, organizationService, userService) {
        this.organizationService = organizationService;
        this.userService = userService;
        this.submissions = submissionCollection;
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
}
module.exports = {
    AWSService
};


