const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const prisma = require("../prisma");
const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants");
const NODE_VIEW = {
    submissionID: "$submissionID",
    nodeType: "$nodeType",
    nodeID: "$nodeID",
    IDPropName: "$IDPropName",
    status:  "$status",
    createdAt: "$createdAt",
    updatedAt: "$updatedAt",
    validatedAt: "$validatedAt",
    uploadedDate: "$updatedAt",
    validatedDate: "$validatedAt",
    orginalFileName:  "$orginalFileName",
    lineNumber: "$lineNumber",
    props: "$props",
    parents: "$parents"
}

const ERROR = "Error";
const WARNING = "Warning";
class DataRecordDAO extends GenericDAO {
    constructor(dataRecordsCollection) {
        super(MODEL_NAME.DATA_RECORDS);
        this.dataRecordsCollection = dataRecordsCollection;
    }

    // note: prisma can't sort by nested JSON paths like rawData.some|field
    async getSubmissionNodes(submissionID, nodeType, first, offset, orderBy, sortDirection, query=null) {
        // Determine if rawData is needed for sorting
        // rawData is only needed when sorting by a nested field path (orderBy contains ".")
        const isOrderByInNodeView = Object.keys(NODE_VIEW).includes(orderBy);
        const needsRawDataForSorting = !isOrderByInNodeView && orderBy.includes(".");
        
        // set orderBy
        let sort = orderBy;
        if (!isOrderByInNodeView) {
            sort = orderBy.includes(".") ? `rawData.${orderBy.replaceAll(".", "|")}` : `props.${orderBy}`
        }
        
        // Base pipeline with match stage
        let basePipeline = [];
        basePipeline.push({
            $match: (!query)?{
                submissionID: submissionID,
                nodeType: nodeType
            }:query
        });

        // Create count pipeline - never needs rawData or projection (count doesn't need field data)
        let countPipeline = [...basePipeline];
        countPipeline.push({
            $count: "total"
        });

        // Create results pipeline with conditional projection, sorting and pagination
        let resultsPipeline = [...basePipeline];
        const resultsProjection = { ...NODE_VIEW };
        if (needsRawDataForSorting) {
            resultsProjection.rawData = "$rawData";
        }
        resultsPipeline.push({
            $project: resultsProjection
        });
        const nodeID= "nodeID";
        let sortFields = {
            [sort]: getSortDirection(sortDirection),
        };
        if (sort !== nodeID){
            sortFields[nodeID] = 1
        }
        resultsPipeline.push({
            $sort: sortFields
        });
        // if -1, returns all data of given node & ignore offset
        if (first !== -1) {
            resultsPipeline.push({
                $skip: offset
            });
            resultsPipeline.push({
                $limit: first
            });
        }

        // Execute both queries in parallel
        const [countPipelineResult, resultsPipelineResult] = await Promise.all([
            this.dataRecordsCollection.aggregate(countPipeline),
            this.dataRecordsCollection.aggregate(resultsPipeline)
        ]);

        const totalRecords = countPipelineResult[0]?.total || 0;
        const dataRecords = resultsPipelineResult || [];

        return {
            total: totalRecords,
            results: dataRecords
        };
    }

    async getStats(submissionID, validNodeStatus) {
        const rows = await prisma.dataRecord.groupBy({
            by: ['submissionID', 'nodeType', 'status'],
            where: { submissionID, status: { in: validNodeStatus } },
            _count: { _all: true },
        });

        const bySubmission = {};

        rows.forEach((r) => {
            if (!bySubmission[r.submissionID]) bySubmission[r.submissionID] = [];
            const stats = bySubmission[r.submissionID];

            let node = stats.find((n) => n.nodeName === r.nodeType);
            if (!node) {
                node = { nodeName: r.nodeType, new: 0, passed: 0, warning: 0, error: 0, total: 0 };
                stats.push(node);
            }

            const c = r._count._all || 0;
            if (r.status === VALIDATION_STATUS.NEW) node.new += c;
            else if (r.status === VALIDATION_STATUS.PASSED) node.passed += c;
            else if (r.status === VALIDATION_STATUS.WARNING) node.warning += c;
            else if (r.status === VALIDATION_STATUS.ERROR) node.error += c;

            node.total = node.new + node.passed + node.warning + node.error;
        });

        return Object.entries(bySubmission).map(([id, stats]) => ({ submissionID: id, stats }));
    }

    // note: use MongoDB because Prisma has to fetch all matching documents into memory before grouping and paginating
    async submissionCrossValidationResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection, dataCommons = null){
        let dataRecordQCResultsPipeline = [];
        // Filter by submission ID
        dataRecordQCResultsPipeline.push({
            $match: {
                submissionID: submissionID
            }
        });

        // Filter by dataCommons scope for cross validation - ticket CRDCDH-3247
        if (dataCommons) {
            dataRecordQCResultsPipeline.push({
                $match: {
                    dataCommons: dataCommons
                }
            });
        }

        // Filter by Batch IDs
        if (!!batchIDs && batchIDs.length > 0) {
            dataRecordQCResultsPipeline.push({
                $match: {
                    $expr: {
                        $gt: [
                            {
                                $size: {
                                    $setIntersection: ["$batchIDs", batchIDs]
                                }
                            },
                            0
                        ]
                    }
                }
            });
        }
        // Collect all validation results
        dataRecordQCResultsPipeline.push({
            $set: {
                results: {
                    validation_type: BATCH.TYPE.METADATA,
                    type: "$nodeType",
                    submittedID: "$nodeID",
                    additionalErrors: "$additionalErrors"
                }
            }
        })
        // Unwind validation results into individual documents
        dataRecordQCResultsPipeline.push({
            $unwind: "$results"
        })
        // Filter out empty validation results
        dataRecordQCResultsPipeline.push({
            $match: {
                additionalErrors: {
                    $exists: true,
                    $not: {
                        $size: 0,
                    },
                    $type: "array"
                }
            }
        });
        // Unwind additional errors and conflicting submissions
        dataRecordQCResultsPipeline.push({
            $unwind: {
                path: "$additionalErrors"
            }
        });
        dataRecordQCResultsPipeline.push({
            $unwind: {
                path: "$additionalErrors.conflictingSubmissions"
            }
        });
        // Group errors by conflicting submission
        dataRecordQCResultsPipeline.push({
            $group: {
                _id: {
                    submissionID: "$submissionID",
                    type: "$results.type",
                    validationType: "$results.validation_type",
                    batchID: "$latestBatchID",
                    displayID: "$latestBatchDisplayID",
                    submittedID: "$results.submittedID",
                    uploadedDate: "$updatedAt",
                    validatedDate: "$validatedAt",
                    warnings: [],
                    severity: VALIDATION_STATUS.ERROR,
                    conflictingSubmission: "$additionalErrors.conflictingSubmissions"
                },
                errors: {
                    $addToSet: "$additionalErrors"
                }
            }
        });
        // Reformatting
        dataRecordQCResultsPipeline.push({
            $set:{
                "_id.errors": "$errors"
            }
        });
        dataRecordQCResultsPipeline.push({
            $replaceRoot: {
                newRoot: "$_id"
            }
        });
        // Filter by node types
        if (!!nodeTypes && nodeTypes.length > 0) {
            dataRecordQCResultsPipeline.push({
                $match: {
                    type: {
                        $in: nodeTypes
                    }
                }
            });
        }
        if (severities === ERROR){
            severities = [ERROR];
        }
        else if (severities === WARNING){
            severities = [WARNING];
        }
        else {
            severities = [ERROR, WARNING];
        }
        dataRecordQCResultsPipeline.push({
            $match: {
                severity: {
                    $in: severities
                }
            }
        })
        // Create count pipeline
        let countPipeline = [...dataRecordQCResultsPipeline];
        countPipeline.push({
            $count: "total"
        });
        const countPipelineResult = await this.dataRecordsCollection.aggregate(countPipeline);
        const totalRecords = countPipelineResult[0]?.total;

        // Create page and sort steps
        let pagedPipeline = [...dataRecordQCResultsPipeline];
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
        // Query page of results
        const pagedPipelineResult = await this.dataRecordsCollection.aggregate(pagedPipeline);
        const dataRecords = this._replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }
    _replaceNaN(results, replacement){
        if (!Array.isArray(results)) return results;
        results?.map((result) => {
            Object.keys(result).forEach((key) => {
                if (Object.is(result[key], Number.NaN)){
                    result[key] = replacement;
                }
            })
        });
        return results;
    }
}

module.exports = DataRecordDAO