const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const config = require("../config");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants.js");
const {BatchType} = require("mongodb");

const ERROR = "Error";
const WARNING = "Warning";
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
    }

    async submissionStats(submissionID) {
        const groupPipeline = { "$group": { _id: "$nodeType", count: { $sum: 1 }} };
        const validNodeStatus = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        const groupByNodeType = await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, status: {$in: validNodeStatus}}}, groupPipeline]);

        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }} };
        const promises = groupByNodeType.map(async node =>
            [await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, nodeType: node?._id, status: {$in: validNodeStatus}}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(submissionID);
        submissionStatsRecords.forEach(aStatSet => {
            const [nodes, nodeName] = aStatSet;
            const stat = Stat.createStat(nodeName);
            nodes.forEach((node) => {
                stat.countNodeType(node?._id, node.count);
            });
            submissionStats.addStats(stat);
        });
        return submissionStats;
    }

    async validateMetadata(submissionID, types, scope) {
        isValidMetadata(types, scope);
        const isMetadata = types.some(t => t === VALIDATION.TYPES.METADATA);
        if (isMetadata ) {
            const docCount = await getCount(this.dataRecordsCollection, submissionID);
            if (docCount === 0)  return ValidationHandler.handle([ERRORS.NO_VALIDATION_METADATA]);
            else {
                if (scope.toLowerCase() === VALIDATION.SCOPE.NEW ){
                    const newDocCount = await getCount(this.dataRecordsCollection, submissionID, scope);
                    if (newDocCount == 0)
                        return ValidationHandler.handle([ERRORS.NO_NEW_VALIDATION_METADATA]);
                }
            }

            const msg = Message.createMetadataMessage("Validate Metadata", submissionID, scope);
            const success = await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.metadataQueueName, submissionID);
            if (!success.success) {
                return success;
            }

        }
        const isFile = types.some(t => (t?.toLowerCase() === VALIDATION.TYPES.DATA_FILE || t?.toLowerCase() === VALIDATION.TYPES.FILE));
        if (isFile) {
            const fileNodes = await getFileNodes(this.dataRecordsCollection, submissionID, scope);
            const fileQueueResults = [];
            for (const aFile of fileNodes) {
                const msg = Message.createFileNodeMessage("Validate File", aFile._id);
                const result = await sendSQSMessageWrapper(this.awsService, msg, aFile._id, this.fileQueueName, submissionID);
                fileQueueResults.push(result);
            }
            const errorMessages = fileQueueResults
                .filter(result => !result.success)
                .map(result => result.message)
                // at least, a node must exists.
                .concat(fileNodes?.length === 0 ? [ERRORS.NO_VALIDATION_FILE] : []);

            if (errorMessages.length > 0) {
                return ValidationHandler.handle(errorMessages)
            }

            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID);
            return await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.fileQueueName, submissionID);
        }
        return isMetadata ? ValidationHandler.success() : ValidationHandler.handle(ERRORS.FAILED_VALIDATE_METADATA);
    }

    async exportMetadata(submissionID) {
        const msg = Message.createFileSubmissionMessage("Export Metadata", submissionID);
        return await sendSQSMessageWrapper(this.awsService, msg, submissionID, config.export_queue, submissionID);
    }

    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection) {
        let pipeline = [];
        // Filter by submission ID
        pipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Lookup submission data
        pipeline.push({
            $lookup:{
                from: "submissions",
                localField: "submissionID",
                foreignField: "_id",
                as: "submission",
            },
        })
        // Set batch ID to latest batch ID
        // Extracts submission data from array
        pipeline.push({
            $set: {
                batchID: {
                    $last: "$batchIDs"
                },
                submission: {
                    $last: "$submission"
                }
            }
        });
        // Lookup Batch data
        pipeline.push({
            $lookup: {
                from: "batch",
                localField: "batchID",
                foreignField: "_id",
                as: "batch",
            }
        });
        // Collect all validation results
        pipeline.push({
            $set: {
                submission_results: {
                    validation_type: BATCH.TYPE.DATA_FILE,
                    type: BATCH.TYPE.DATA_FILE,
                    submittedID: "$nodeID",
                    errors: "$submission.fileErrors",
                    warnings: "$submission.fileWarnings"
                },
                metadata_results: {
                    validation_type: BATCH.TYPE.METADATA,
                    type: "$nodeType",
                    submittedID: "$nodeID",
                    errors: "$errors",
                    warnings: "$warnings"
                },
                datafile_results: {
                    validation_type: BATCH.TYPE.DATA_FILE,
                    type: BATCH.TYPE.DATA_FILE,
                    submittedID: "$s3FileInfo.fileName",
                    errors: "$s3FileInfo.errors",
                    warnings: "$s3FileInfo.warnings",
                }
            }
        })
        // Add all validation results to a single array
        pipeline.push({
            $set: {
                results: [
                    "$submission_results",
                    "$metadata_results",
                    "$datafile_results",
                ]
            }
        })
        // Unwind validation results into individual documents
        pipeline.push({
            $unwind: "$results"
        })
        // Filter out empty validation results
        pipeline.push({
            $match: {
                $or: [
                    {
                        "results.errors": {
                            $exists: true,
                            $not: {
                                $size: 0,
                            },
                        },
                    },
                    {
                        "results.warnings": {
                            $exists: true,
                            $not: {
                                $size: 0,
                            },
                        },
                    },
                ],
            },
        })
        // Reformat documents
        pipeline.push({
            $project: {
                submissionID: "$submissionID",
                type: "$results.type",
                validationType: "$results.validation_type",
                batchID: "$batchID",
                displayID: {
                    $first: "$batch.displayID",
                },
                submittedID: "$results.submittedID",
                uploadedDate: "$updatedAt",
                validatedDate: "$validatedAt",
                errors: {
                    $ifNull: ["$results.errors", []],
                },
                warnings: {
                    $ifNull: ["$results.warnings", []],
                },
            }
        })
        // Set severity based on the errors array
        pipeline.push({
            $set: {
                severity: {
                    $cond: {
                        if: {
                            $gt: [{$size: "$errors"}, 0],
                        },
                        then: VALIDATION_STATUS.ERROR,
                        else: VALIDATION_STATUS.WARNING,
                    }
                }
            }
        })
        // Filter by severity
        if (severities === ERROR){
            severities = [ERROR];
        }
        else if (severities === WARNING){
            severities = [WARNING];
        }
        else {
            severities = [ERROR, WARNING];
        }
        pipeline.push({
            $match: {
                severity: {
                    $in: severities
                }
            }
        })
        // Filter by node types
        if (!!nodeTypes && nodeTypes.length > 0) {
            pipeline.push({
               $match: {
                   type: {
                       $in: nodeTypes
                   }
               }
            });
        }
        // Filter by Batch IDs
        if (!!batchIDs && batchIDs.length > 0) {
            pipeline.push({
                $match: {
                    batchID: {
                        $in: batchIDs
                    }
                }
            });
        }
        // Create page and sort steps
        let page_pipeline = [];
        const nodeType = "type";
        let sortFields = {
            [orderBy]: getSortDirection(sortDirection),
        };
        if (orderBy !== nodeType){
            sortFields[nodeType] = 1
        }
        page_pipeline.push({
            $sort: sortFields
        });
        page_pipeline.push({
            $skip: offset
        });
        page_pipeline.push({
            $limit: first
        });
        // Get paged results and total count
        pipeline.push({
            $facet: {
                results: page_pipeline,
                total: [{
                    $count: "total"
                }]
            }
        });
        // Extract total count from total object
        pipeline.push({
            $set: {
                total: {
                    $first: "$total.total",
                }
            }
        });
        // Execute pipeline
        let dataRecords = await this.dataRecordsCollection.aggregate(pipeline);
        dataRecords = dataRecords.length > 0 ? dataRecords[0] : {}
        dataRecords.results = this.#replaceNaN(dataRecords?.results, null);
        return {
            results: dataRecords.results || [],
            total: dataRecords.total || 0
        }
    }

    async listSubmissionNodeTypes(submissionID){
        if (!submissionID){
            return []
        };
        const filter = {
            submissionID: submissionID
        };
        return await this.dataRecordsCollection.distinct("nodeType", filter);
    }
    
    #replaceNaN(results, replacement){
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

const getFileNodes = async (dataRecordsCollection, submissionID, scope) => {
    const isNewScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase();
    const fileNodes = await dataRecordsCollection.aggregate([{
        $match: {
            s3FileInfo: { $exists: true, $ne: null },
            submissionID: submissionID,
            // case-insensitive search
            ...(isNewScope ? { status: { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}},
        {$sort: {"s3FileInfo.size": 1}}
    ]);
    return fileNodes || [];
}

const getCount = async (dataRecordsCollection, submissionID, status = null) => {
    const query = (!status)? {submissionID: submissionID} : {submissionID: submissionID, status: status} ;
    return await dataRecordsCollection.countDoc(query);
}

const sendSQSMessageWrapper = async (awsService, message, deDuplicationId, queueName, submissionID) => {
    try {
        await awsService.sendSQSMessage(message, deDuplicationId, deDuplicationId, queueName);
        return ValidationHandler.success();
    } catch (e) {
        console.error(ERRORS.FAILED_VALIDATE_METADATA, `submissionID:${submissionID}`, `queue-name:${queueName}`, `error:${e}`);
        return ValidationHandler.handle(`queue-name: ${queueName}. ` + e);
    }
}

const isValidMetadata = (types, scope) => {
    const isValidTypes = types.every(t => (t?.toLowerCase() === VALIDATION.TYPES.DATA_FILE || t?.toLowerCase() === VALIDATION.TYPES.FILE ||t?.toLowerCase() === VALIDATION.TYPES.METADATA));
    if (!isValidTypes) {
        throw new Error(ERRORS.INVALID_SUBMISSION_TYPE);
    }
    // case-insensitive
    const isValidScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || scope?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase();
    if (!isValidScope) {
        throw new Error(ERRORS.INVALID_SUBMISSION_SCOPE);
    }
}

class Message {
    constructor(type) {
        this.type = type;
    }
    static createMetadataMessage(type, submissionID, scope) {
        const msg = new Message(type);
        msg.submissionID = submissionID;
        msg.scope= scope;
        return msg;
    }

    static createFileSubmissionMessage(type, submissionID) {
        const msg = new Message(type);
        msg.submissionID = submissionID;
        return msg;
    }

    static createFileNodeMessage(type, dataRecordID) {
        const msg = new Message(type);
        msg.dataRecordID = dataRecordID;
        return msg;
    }
}

class Stat {
    constructor(nodeName, totalCount, newCount, passedCount, warningCount, errorCount) {
        this.nodeName = nodeName;
        this.total = totalCount;
        this.new = newCount;
        this.passed = passedCount;
        this.warning= warningCount;
        this.error = errorCount;
    }

    static createStat(nodeName) {
        return new Stat(nodeName, 0,0,0,0, 0);
    }

    #addTotal(total) {
        this.total += total;
    }

    countNodeType(node, count) {
        switch (node) {
            case VALIDATION_STATUS.NEW:
                this.new += count;
                break;
            case VALIDATION_STATUS.ERROR:
                this.error += count;
                break;
            case VALIDATION_STATUS.WARNING:
                this.warning += count;
                break;
            case VALIDATION_STATUS.PASSED:
                this.passed += count;
                break;
            default:
                return;
        }
        this.#addTotal(count);
    }
}

class SubmissionStats {
    constructor(submissionID) {
        this.submissionID = submissionID;
        this.stats = [];
    }

    static createSubmissionStats(submissionID) {
        return new SubmissionStats(submissionID);
    }

    addStats(stat) {
        this.stats.push(stat);
    }
}

module.exports = {
    DataRecordService
};


