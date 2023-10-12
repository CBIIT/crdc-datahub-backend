const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
class BatchService {
    constructor(s3Service, batchCollection, bucketName) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
        this.bucketName = bucketName;
    }

    async findByID(id) {
        const result = await this.batchCollection.aggregate([{
            "$match": {
                _id: id
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }

    async createBatch(params, rootPath, orgID) {
        const prefix = createPrefix(params, rootPath, orgID);
        const metadataIntention = params?.metadataIntention && params.type === BATCH.TYPE.METADATA ? params.metadataIntention : null;
        const newBatch = Batch.createNewBatch(params.submissionID, this.bucketName, prefix, params.type, metadataIntention);
        if (BATCH.TYPE.METADATA === params.type.toLowerCase()) {
            const submissionID = params.submissionID;
            await Promise.all(params.files.map(async (file) => {
                if (file.fileName) {
                    const signedURL = await this.s3Service.createPreSignedURL(this.bucketName, submissionID, file.fileName);
                    newBatch.addFile(file.fileName, file.size , signedURL);
                }
            }));
        } else {
            params.files.forEach((file) => {
                if (file.fileName) {
                    newBatch.addFile(file.fileName, file.size);
                }
            });
        }
        const inserted = await this.batchCollection.insert(newBatch);
        if (!inserted?.acknowledged) {
            console.error(ERROR.FAILED_NEW_BATCH_INSERTION);
            throw new Error(ERROR.FAILED_NEW_BATCH_INSERTION);
        }
        return newBatch;
    }
    async updateBatch(aBatch, files, succededFlag, userInfo) {
        this._succededFlag = succededFlag;
        // TODO if succeeded true
        // TODO update batch succeeded status


        // TODO if batch status is not new, throw error

        // UploadResult
        // input UploadResult {
        //     fileName: String
        //     succeeded: Boolean
        //     errors: [String]
        // }

        // find by file names
        //

        // TODO FE might not send all files, creating overhead
        // by batch ID, it could check all the files uploaded
        aBatch.files.forEach((file) => {
            // for the matched file from FE
            const matchingFile = files.find((uploadFile) => uploadFile.fileName === file.fileName);
            file.succeeded = matchingFile?.succeeded || false;

            if (!matchingFile?.succeeded) {
                aBatch.status = "failed";
                return;
            }
        });
        aBatch.status = "succeeded";

        // todo update batch status






        // TODO if succeeded false
        // TODO store error values

    }

}

const createPrefix = (params, rootPath, orgID) => {
    if (rootPath) {
        return `${rootPath}/${params.type}/`;
    }
    if (!orgID) {
        throw new Error(ERROR.NEW_BATCH_NO_ORGANIZATION);
    }
    const prefixArray = [orgID, params.submissionID];
    prefixArray.push(params.type === BATCH.TYPE.METADATA ? BATCH.TYPE.METADATA : BATCH.TYPE.FILE);
    return prefixArray.join("/");
}

module.exports = {
    BatchService
}