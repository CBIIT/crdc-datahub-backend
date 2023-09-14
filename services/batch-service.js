const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
class BatchService {

    constructor(s3Service, batchCollection) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
    }

    async createBatch(params, context) {
        // TODO Should be permission controlled, submission owner or org owner
        // TODO files: [FileURL] # only available for metadata batch
        const type = params.type;
        // TODO throw submission id or throw type error
        // TODO throw files not included
        const files = params.files;
        // TODO where bucket name stored
        const bucketName = "bucket name";
        const newBatch = Batch.createNewBatch(params.submissionID, bucketName, "FILE-PREFIX", type, params?.metadataIntention);
        if (BATCH.TYPE.METADATA === params.type) {
            await Promise.all(files.map(async (file) => {
                // TODO files: [FileURL] # only available for metadata batch
                if (file.fileName) {
                    const signedURL = this.s3Service.createPreSignedURL(bucketName, submissionID,file.fileName);
                    newBatch.addFile(file.fileName, signedURL);
                }
            }));
        }
        const inserted = this.batchCollection.insert(newBatch);
        // get inserted id, retrieve batch
        return newBatch;
    }

}

module.exports = {
    BatchService
}