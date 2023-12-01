const {NODE_TYPE} = require("../constants/submission-constants");

class DataRecordService {
    constructor(dataRecordsCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
    }

    async isValidatedSubmission(submissionID) {
        const result = await this.dataRecordsCollection.aggregate([{
            "$match": {
                submissionID: submissionID,
                status: {$ne: NODE_TYPE.PASSED}
            }
        }, {"$limit": 1}]);
        return !result || result?.length === 0;
    }
}

module.exports = {
    DataRecordService
};