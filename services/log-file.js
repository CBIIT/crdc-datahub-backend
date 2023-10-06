const path = require("path");
const config = require('../config');
const {AWSService} = require("./aws-request");
const {verifySession, verifySubmitter} = require("../verifier/user-info-verifier");
const {getSubmisssionRootPath} = require("../utility/string-util")

/**
 * This class provides services to list log files based on submission Id
 */
const UPLOAD_TYPES = {FILE: 'file', MEATDATA: 'metadata'};
const LOG_DIR = 'log';
const LOG_FILE_EXT ='.log';
class LogService {
    constructor(submissionCollection, organizationService, userService) {
        this.organizationService = organizationService;
        this.userService = userService;
        this.submissions = submissionCollection;
        this.aws = new AWSService(null, null, null);
    }
    /**
     * API to get list of upload log files
     * @param {*} params 
     * @param {*} context 
     * @returns filelist []
     */
    async listLogs(params, context){
        //1) verify session
        verifySession(context)
            .verifyInitialized();
        //2) verify submitter
        const submission = await verifySubmitter(context.userInfo, params?.submissionID, this.submissions, this.userService);
        //3) get upload log files
        const rootPath = await getSubmisssionRootPath(submission, this.organizationService);
        try {
            const fileList = await getLogFiles(config.submission_aws_bucket_name, rootPath);
            return {logFiles: fileList} 
        }
        catch(err)
        {
            throw new Error(`${ERROR.FAILED_LIST_LOG}, ${params.submissionID}! ${err}`);
        }
    }
    /**
     * 
     * @param {*} params as objerct {} cotains submissisonID
     * @param {*} context 
     * @returns fileList []
     */
    async getLogFiles(bucket, rootPath){
        let fileList = []; 
        for (type in UPLOAD_TYPES){
            let file = await this.aws.getLastFileFromS3(bucket, `${rootPath}/${type}/${LOG_DIR}`, LOG_FILE_EXT);
            if(file) fileList.push(file);
        }
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
}

module.exports = {
    LogService
};

 