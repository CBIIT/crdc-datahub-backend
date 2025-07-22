const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {APPROVED_STUDIES_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");

class SubmissionDAO extends GenericDAO {
    constructor(submissionCollection) {
        super(MODEL_NAME.SUBMISSION);
        this.submissionCollection = submissionCollection;
    }
    // prisma is unable to join study._id
    async programLevelSubmissions(studyIDs) {
        return await this.submissionCollection.aggregate([
            {$match: {
                    studyID: { $in: studyIDs }
            }},
            {$lookup: {
                    from: APPROVED_STUDIES_COLLECTION, // adjust if the actual collection name is different
                    localField: 'studyID',
                    foreignField: '_id',
                    as: 'studyInfo'
            }},
            {$unwind: '$studyInfo'},
            {$match: {
                    // This flag indicates the program level primary contact(data concierge)
                    'studyInfo.useProgramPC': true
            }},
            {$project: {
                    _id: 1
            }}]);
    }
}

module.exports = SubmissionDAO