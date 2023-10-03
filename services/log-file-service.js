/**
 * This class provides services to list log files based on submission Id
 */

class Log_files_service {
    constructor(logCollection, applicationCollection, submissionollection, organizationService, userService, dbService, submissions) {
        this.logCollection = logCollection;
        this.applicationCollection = applicationCollection;
        this.organizationService = organizationService;
        this.userService = userService;
        this.dbService = dbService;
        this.notificationService = notificationsService;
        this.emailParams = emailParams;
        this.submissions = submissionollection;
    }
    /**
     * 
     * @param {*} params as objerct {} cotains submissisonID
     * @param {*} context 
     * @returns fileList []
     */
    async listLogs(params, context){
        let fileList = [];
        //to do
        //1) verify session
        //2) verify submitter
        //3) call aws s3 list objects for meatadata uploading log(s)
        //4) get last metadata log object metadats and appending to fileList
        //5) call aws s3 list objects for file uploading log(s)
        //6) get lasr file uploading log object metadats and appending to fileList

        return fileList;
    }
    /**
     * 
     * @param {*} params as object {}  contains submissionID and file name
     * @param {*} context 
     * @returns file object
     */
    async downloadLog(params, context){
        let file = null;
        //to do
        //1) verify session
        //2) verify submitter
        //3) call aws s3 list objects based on the path.

        return file;
    }

}

 