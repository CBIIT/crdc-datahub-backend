const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const ERROR = require("../constants/error-constants");
class BatchService {
    constructor(s3Service, batchCollection, bucketName, applicationService, organizationService, userService) {
        this.s3Service = s3Service;
        this.batchCollection = batchCollection;
        this.bucketName = bucketName;
        this.applicationService = applicationService;
        this.organizationService = organizationService;
        this.userService = userService;
    }

    async createBatch(params, context) {
        await verifyBatchPermission(this.applicationService, this.organizationService, this.userService, params.submissionID, context?.userInfo);
        const prefix = createPrefix(context?.userInfo?.organization);
        const newBatch = Batch.createNewBatch(params.submissionID, this.bucketName, prefix, params.type, params?.metadataIntention);
        if (BATCH.TYPE.METADATA === params.type) {
            const submissionID = params.submissionID;
            await Promise.all(params.files.map(async (file) => {
                if (file.fileName) {
                    const signedURL = this.s3Service.createPreSignedURL(this.bucketName, submissionID, file.fileName);
                    newBatch.addFile(file.fileName, signedURL);
                }
            }));
        }
        const inserted = this.batchCollection.insert(newBatch);
        if (!inserted?.acknowledged) {
            console.error(ERROR.FAILED_NEW_BATCH_INSERTION);
            throw new Error(ERROR.FAILED_NEW_BATCH_INSERTION);
        }
        return newBatch;
    }

}

const isPermittedUserOrThrow = (userInfo, targetUser) => {
    if (targetUser?.email != userInfo.email && targetUser?.IDP != userInfo.IDP) {
        throw new Error(ERROR.INVALID_BATCH_PERMISSION);
    }
}

const verifyBatchPermission= async(applicationService, organizationService, userService, submissionID, userInfo) => {
    // verify submission owner
    const aApplication = await applicationService.getApplicationById(submissionID);
    const applicantUserID = aApplication.applicant.applicantID;
    const aUser = await userService.getUserByID(applicantUserID);
    isPermittedUserOrThrow(userInfo, aUser);
    // verify if organization owner owns submission
    const aOrganization = await organizationService.getOrganizationByID(aApplication.organization._id);
    if (aOrganization) {
        const ownerID = aOrganization.owner;
        const aUser = await userService.getUserByID(ownerID);
        isPermittedUserOrThrow(userInfo, aUser);
    }
}

const createPrefix = (params, organization) => {
    if (!organization?.orgID) {
        throw new Error(ERROR.NEW_BATCH_NO_ORGANIZATION);
    }
    const prefixArray = [organization.orgID, params.submissionID];
    prefixArray.add(params.type === BATCH.TYPE.METADATA ? BATCH.TYPE.METADATA : BATCH.TYPE.FILE);
    return prefixArray.join("/");
}

module.exports = {
    BatchService
}