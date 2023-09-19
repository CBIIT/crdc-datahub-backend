const {Batch} = require("../domain/batch");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const {verifyBatch} = require("../verifier/batch-verifier");
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
        // TODO remove this to graphql
        // TODO Login

        verifyBatch(params)
            .isUndefined()
            .notEmpty()
            .batchType([BATCH.TYPE.METADATA, BATCH.TYPE.FILE]);

        // TODO Should be permission controlled, submission owner or org owner

        // Organization service
        const aApplication = await this.applicationService.getApplicationById(params.submissionID);
        // TODO submission ID does not exists
        if (!aApplication) {

            if (aUser.email != context.userInfo.email && aUser.IDP != context.userInfo.IDP) {

            }

            // TODO compare applicant vs context session user
            // TODO throw
        }

        const aOrganization = await this.organizationService.getOrganizationByID(aApplication.organization._id);
        if (aOrganization) {
            const ownerID = aOrganization.owner;
            const aUser = await this.userService.getUserByID(ownerID);
            if (aUser.email != context.userInfo.email && aUser.IDP != context.userInfo.IDP) {

            }
        }


        // 1. compare user's email and idp

        // Only submission owner and submitter's Org Owner can upload data, otherwise this button should be disabled.
        // get submission ID => get the applicant
        // get the submission org owner




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