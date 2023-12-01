class DataRecordService {
    constructor(dataRecordsCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
    }



    async isValidatedSubmission(submissionID) {


        const result = await this.dataRecordsCollection.aggregate([{
            "$match": {
                _id: dataRecordsCollection
            }
        }, {"$limit": 1}]);


    }



}




module.exports = {
    DataRecordService
};