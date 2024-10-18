const ERROR = require("../constants/error-constants");
const USER_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-constants");
const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {verifyValidationResultsReadPermissions} = require("../verifier/permissions-verifier");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const ROLES = USER_CONSTANTS.USER.ROLES;

function replaceNaN(results, replacement){
    results?.map((result) => {
        Object.keys(result).forEach((key) => {
            if (Object.is(result[key], Number.NaN)){
                result[key] = replacement;
            }
        })
    });
    return results;
}

class QcResultService{
    constructor(qcResultCollection, submissionCollection){
        this.qcResultCollection = qcResultCollection;
        this.submissionCollection = submissionCollection;
    }

    async submissionQCResultsAPI(params, context){
        // Check that the specified submissionID exists
        const submission = await this.submissionCollection.findOne(params._id);
        if(!submission){
            throw new Error(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        }
        // Check that the user is authorized to view the QC results
        if (!verifyValidationResultsReadPermissions(context.userInfo, submission)){
            // Unauthorized Federal Monitors require a different error message
            if (context.userInfo?.role === ROLES.FEDERAL_MONITOR){
                throw new Error(ERROR.INVALID_ROLE_STUDY);
            }
            throw new Error(ERROR.INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS);
        }

        return await this.submissionQCResults(params._id, params.nodeTypes, params.batchIDs, params.severities, params.first, params.offset, params.orderBy, params.sortDirection);
    }


    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection){
        // Create lookup pipeline
        let pipeline = [];
        // Filter by submission ID
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Filter by severity
        if (severities === VALIDATION_STATUS.ERROR){
            pipeline.push({
                $match: {
                    severity: VALIDATION_STATUS.ERROR
                }
            });
        }
        // Filter by batch IDs
        if (!!batchIDs && batchIDs.length > 0){
            // Check if any of the specified batchIDs are in the qcResult
            pipeline.push({
                $set:{
                    batch_check: {
                        $size: {
                            $setIntersection: ["$batchIDs", batchIDs]
                        }
                    }
                }
            })
            // Filter out qcResults where the batch_check is less than 1
            pipeline.push({
                $match:{
                    batch_check: {
                        $gte: 1
                    }
                }
            })
        }
        // Create count pipeline
        let countPipeline = [...pipeline];
        countPipeline.push({
            $count: "total"
        });
        const countPipelineResult = await this.qcResultCollection.aggregate(countPipeline);
        const totalRecords = countPipelineResult[0]?.total;
        // Create paginated pipeline
        let pagedPipeline = [...pipeline];
        const nodeType = "type";
        let sortFields = {
            [orderBy]: getSortDirection(sortDirection),
        };
        if (orderBy !== nodeType){
            sortFields[nodeType] = 1
        }
        pagedPipeline.push({
            $sort: sortFields
        });
        pagedPipeline.push({
            $skip: offset
        });
        if (first > 0){
            pagedPipeline.push({
                $limit: first
            });
        }
        const pagedPipelineResult = await this.qcResultCollection.aggregate(pagedPipeline);
        const dataRecords = replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }
}

module.exports = {
    QcResultService
};
