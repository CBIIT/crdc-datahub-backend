const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const ISSUE_COUNT = "issueCount";
const ALL_FLAG = "All";
class QCResultDAO extends GenericDAO {
    constructor(qcResultCollection) {
        super(MODEL_NAME.QC_RESULT);
        this.qcResultCollection = qcResultCollection;
    }

    // note: use MongoDB because Prisma has to fetch all matching documents into memory before grouping and paginating
    async aggregatedSubmissionQCResults(submissionID, severity, first, offset, orderBy, sortDirection) {
        // Create lookup pipeline
        let basePipeline = [];
        // Filter by submission ID
        basePipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Set severity field
        basePipeline.push({
            $set: {
                "errors.severity": VALIDATION_STATUS.ERROR,
                "warnings.severity": VALIDATION_STATUS.WARNING
            }
        })
        // Combine warnings and errors arrays
        basePipeline.push({
            $set: {
                issues: {
                    $concatArrays: ["$warnings", "$errors"]
                }
            }
        })
        // Unwind issues array
        basePipeline.push({
            $unwind:{
                path: "$issues"
            }
        });
        // Filter by severity
        // Format severity filter
        let severityFilter = formatSeverityFilter(severity);
        // Add the severity filter to the pipeline
        if (!!severityFilter) {
            basePipeline.push({
                $match:{
                    "issues.severity": severityFilter
                }
            });
        }
        // Aggregate and count distinct data records for each issue type
        basePipeline.push({
            $group:{
                _id: {
                    title: "$issues.title",
                    severity: "$issues.severity",
                    code: "$issues.code",
                    property: "$issues.offendingProperty",
                    value: "$issues.offendingValue"
                },
                distinctRecords: {
                    $addToSet: "$dataRecordID"  // Collect unique dataRecordID values for this specific issue type (title, severity, code, property, value combination)
                }
            }
        });
        // Count distinct data records (not individual issue occurrences)
        basePipeline.push({
            $addFields: {
                count: { $size: "$distinctRecords" }  // Calculate count as the number of distinct records with this issue
            }
        });
        // Format the output
        basePipeline.push({
            $project:{
                _id: 0,
                title: "$_id.title",
                severity: "$_id.severity",
                code: "$_id.code",
                count: "$count",
                property: { $ifNull: ["$_id.property", "N/A"] },
                value: { $ifNull: ["$_id.value", "N/A"] }
            }
        });
        // Create count pipeline
        let countPipeline = [...basePipeline];
        countPipeline.push({
            $count: "total"
        });
        // Create pagination pipeline
        let paginationPipeline = [...basePipeline];
        // Sort the results
        paginationPipeline.push({
            $sort: {
                [orderBy]: getSortDirection(sortDirection)
            }
        });
        // Paginate
        if (offset > 0){
            paginationPipeline.push({
                $skip: offset
            });
        }
        if (first > 0){
            paginationPipeline.push({
                $limit: first
            });
        }
        // Run pipelines
        const countPipelineResult = await this.qcResultCollection.aggregate(countPipeline);
        const totalRecords = countPipelineResult[0]?.total;
        const paginatedPipelineResult = await this.qcResultCollection.aggregate(paginationPipeline);
        return {
            total: totalRecords || 0,
            results: paginatedPipelineResult
        };
    }

    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, issueCode, first, offset, orderBy, sortDirection){
        // Create lookup pipeline
        let pipeline = [];
        // Filter by submission ID
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Filter by severity
        const arrayWithElements = {
            $exists: true,
            $type: 'array',
            $ne: []
        }
        if (severities === VALIDATION_STATUS.ERROR){
            pipeline.push({
                $match: {
                    errors: arrayWithElements
                }
            });
            // Add error length
            pipeline.push({
                $set: {
                    [ISSUE_COUNT]: { $size: "$errors" }
                }
            });
        }
        else if (severities === VALIDATION_STATUS.WARNING){
            pipeline.push({
                $match: {
                    warnings: arrayWithElements
                }
            });
            // Add warning length
            pipeline.push({
                $set: {
                    [ISSUE_COUNT]: { $size: "$warnings" }
                }
            });
        }
        // Setting all flag.
        if (severities === ALL_FLAG){
            pipeline.push({
                $set: {
                    [ISSUE_COUNT]: {
                        $add: [
                            { $size: { $ifNull: ["$warnings", []] } },
                            { $size: { $ifNull: ["$errors", []] } }
                        ]
                    }
                }
            });
        }

        // Filter by batch IDs
        if (!!batchIDs && batchIDs.length > 0){
            // If multiple batchIDs are specified, then only the first will be used for the filter
            const batchID = batchIDs[0];
            // Check if any of the specified batchIDs are in the qcResult
            pipeline.push({
                $match:{
                    latestBatchID: batchID
                }
            })
        }
        // Filter by nodeTypes
        if (!!nodeTypes && nodeTypes.length > 0){
            // Check if any of the specified nodeTypes are in the qcResult
            pipeline.push({
                $match:{
                    type: {
                        $in: nodeTypes
                    }
                }
            })
        }
        // Filter by issueCode
        if (!!issueCode){
            // Check if the specified issueCode is in any of the qcResult's errors or warnings
            pipeline.push({
                $match:{
                    $or: [
                        {"errors.code": issueCode},
                        {"warnings.code": issueCode}
                    ]
                }
            })
        }
        pipeline.push({
            $set:{
                batchID: "$latestBatchID"
            }
        })
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
        const dir = getSortDirection(sortDirection);
        const primarySortBy = (orderBy === ISSUE_COUNT) ? ISSUE_COUNT : orderBy;

        let sortFields = { [primarySortBy]: dir };
        // add secondary sort by nodeType when primary isn't nodeType
        if (primarySortBy !== nodeType) {
            sortFields[nodeType] = 1;
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

function formatSeverityFilter(severity){
    if (!severity || typeof severity !== "string"){
        return null;
    }
    severity = severity.toLowerCase();
    if (severity === VALIDATION_STATUS.ERROR.toLowerCase()){
        return VALIDATION_STATUS.ERROR;
    }
    if (severity === VALIDATION_STATUS.WARNING.toLowerCase()){
        return VALIDATION_STATUS.WARNING;
    }
    return null;
}

module.exports = QCResultDAO