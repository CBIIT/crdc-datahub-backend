const {Batch} = require("../domain/batch");
const {BATCH, FILE} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
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
    async updateBatch(aBatch, files) {
        const uploadFiles = new Map(files
            .filter(aFile => (aFile?.fileName) && aFile?.fileName.trim().length > 0)
            .map(file => [file?.fileName, file]));
        const succeededFiles = [];
        for (const aFile of aBatch.files) {
            if (!uploadFiles.has(aFile.fileName)) {
                continue;
            }
            const aUploadFile = uploadFiles.get(aFile.fileName);
            if (aUploadFile?.succeeded) {
                aFile.status = FILE.UPLOAD_STATUSES.UPLOADED;
                succeededFiles.push(aFile);
                continue;
            }
            aFile.status = FILE.UPLOAD_STATUSES.FAILED;
            aFile.error = uploadFiles.get[aFile.fileName]?.error || [];
        }
        // Count how many batch files updated from FE match the uploaded files.
        const isAllUploaded = files?.length > 0 && succeededFiles.length === files?.length;
        aBatch.status = isAllUploaded ? BATCH.STATUSES.UPLOADED : BATCH.STATUSES.FAILED;
        aBatch.updatedAt = getCurrentTime();
        await asyncUpdateBatch(this.batchCollection, aBatch);
        return this.findByID(aBatch._id);
    }
}

const asyncUpdateBatch = async (batchCollection, aBatch) => {
    const updated = await batchCollection.update(aBatch);
    if (!updated?.acknowledged){
        const error = ERROR.FAILED_BATCH_UPDATE;
        console.error(error);
        throw new Error(error);
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