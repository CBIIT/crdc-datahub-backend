const {VALIDATION_STATUS, DATA_FILE} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const config = require("../config");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants.js");

const ERROR = "Error";
const WARNING = "Warning";
const NODE_VIEW = {
    submissionID: "$submissionID",
    nodeType: "$nodeType",
    nodeID: "$nodeID",
    status:  "$status",
    createdAt: "$createdAt",
    updatedAt: "$updatedAt",
    validatedAt: "$validatedAt",
    uploadedDate: "$updatedAt",
    validatedDate: "$validatedAt",
    orginalFileName:  "$orginalFileName",
    lineNumber: "$lineNumber",
    props: "$props",
    parents: "$parents",
    rawData: "$rawData"
}
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

        const res = await Promise.all([
            await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, status: {$in: validNodeStatus}}}, groupPipeline]),
            await this.dataRecordsCollection.aggregate([
                { "$match": {submissionID: submissionID, "s3FileInfo.status": {$in: validNodeStatus}}},
                { "$group": { _id: "$s3FileInfo.status", count: { $sum: 1 }} }])
        ]);
        const [groupByNodeType, groupByDataFile] = res;
        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }} };
        const promises = groupByNodeType.map(async node =>
            [await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, nodeType: node?._id, status: {$in: validNodeStatus}}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(submissionID);
        submissionStatsRecords.forEach(aStatSet => {
            const [nodes, nodeName] = aStatSet;
            this.#addNodeToStats(submissionStats, nodes, nodeName)
        });
        this.#addNodeToStats(submissionStats, groupByDataFile, DATA_FILE);
        return submissionStats;
    }

    async validateMetadata(submissionID, types, scope) {
        isValidMetadata(types, scope);
        const isMetadata = types.some(t => t === VALIDATION.TYPES.METADATA);
        let errorMessages = [];
        if (isMetadata ) {
            const docCount = await getCount(this.dataRecordsCollection, submissionID);
            if (docCount === 0)  errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, ERRORS.NO_VALIDATION_METADATA);
            else {
                const newDocCount = await getCount(this.dataRecordsCollection, submissionID, scope);
                if (!(scope.toLowerCase() === VALIDATION.SCOPE.NEW && newDocCount === 0)) {
                    const msg = Message.createMetadataMessage("Validate Metadata", submissionID, scope);
                    const success = await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.metadataQueueName, submissionID);
                    if (!success.success)
                        errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, success.message)
                }
                else {
                    errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, ERRORS.NO_NEW_VALIDATION_METADATA);
                }
            }
        }
        const isFile = types.some(t => (t?.toLowerCase() === VALIDATION.TYPES.DATA_FILE || t?.toLowerCase() === VALIDATION.TYPES.FILE));
        if (isFile) {
            let fileValidationErrors = [];
            const fileNodes = await getFileNodes(this.dataRecordsCollection, submissionID, scope);
            if (fileNodes && fileNodes.length > 0) {
                for (const aFile of fileNodes) {
                    const msg = Message.createFileNodeMessage("Validate File", aFile._id);
                    const result = await sendSQSMessageWrapper(this.awsService, msg, aFile._id, this.fileQueueName, submissionID);
                    if (!result.success)
                        fileValidationErrors.append(result.message);
                }
            }
            const msg1 = Message.createFileSubmissionMessage("Validate Submission Files", submissionID);
            const result1= await sendSQSMessageWrapper(this.awsService, msg1, submissionID, this.fileQueueName, submissionID);
            if (!result1.success)
                fileValidationErrors.append(result1.message);

            if (fileValidationErrors.length > 0)
                errorMessages.push(ERRORS.FAILED_VALIDATE_FILE, ...fileValidationErrors)
        }
        return (errorMessages.length > 0) ? ValidationHandler.handle(errorMessages) : ValidationHandler.success();
    }

    async exportMetadata(submissionID) {
        const msg = Message.createFileSubmissionMessage("Export Metadata", submissionID);
        return await sendSQSMessageWrapper(this.awsService, msg, submissionID, config.export_queue, submissionID);
    }

    async submissionQCResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection) {
        let dataRecordQCResultsPipeline = [];
        // Filter by submission ID
        dataRecordQCResultsPipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Set batch ID to latest batch ID
        dataRecordQCResultsPipeline.push({
            $set: {
                batchID: {
                    $last: "$batchIDs"
                }
            }
        });
        // Lookup Batch data
        dataRecordQCResultsPipeline.push({
            $lookup: {
                from: "batch",
                localField: "batchID",
                foreignField: "_id",
                as: "batch",
            }
        });
        // Collect all validation results
        dataRecordQCResultsPipeline.push({
            $set: {
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
        dataRecordQCResultsPipeline.push({
            $set: {
                results: [
                    "$metadata_results",
                    "$datafile_results",
                ]
            }
        })
        // Unwind validation results into individual documents
        dataRecordQCResultsPipeline.push({
            $unwind: "$results"
        })
        // Filter out empty validation results
        dataRecordQCResultsPipeline.push({
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
        dataRecordQCResultsPipeline.push({
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
        // new pipeline to get extra file validation results
        let extraFileQCResultsPipeline = [];
        // match submission by ID
        extraFileQCResultsPipeline.push({
            $match: {
                _id: submissionID
            }
        });
        // combine qc_results objects into a single arrays
        extraFileQCResultsPipeline.push({
            $project: {
                qc_results: {
                    $concatArrays: ["$fileErrors", "$fileWarnings"]
                }
            }
        });
        // unwind the $qc_results array
        extraFileQCResultsPipeline.push({
            $unwind: "$qc_results"
        });
        // remove non-object type errors (non-validation errors)
        extraFileQCResultsPipeline.push({
            $match:{
                qc_results: {
                    $type: "object",
                },
            },
        })
        // set the qc_results object as the root of the documents
        extraFileQCResultsPipeline.push({
            $replaceRoot: {
                newRoot: "$qc_results"
            }
        });
        // add the submission ID
        extraFileQCResultsPipeline.push({
            $set: {
                submissionID: submissionID
            }
        });
        // run the extra file QC results pipeline and combine the output with the data record QC results pipeline results
        dataRecordQCResultsPipeline.push({
            $unionWith: {
                coll: "submissions",
                pipeline: extraFileQCResultsPipeline
            }
        });
        // replace null errors and warnings properties to empty arrays
        dataRecordQCResultsPipeline.push({
            $set: {
                errors: {
                    $ifNull: ["$errors", []],
                },
                warnings: {
                    $ifNull: ["$warnings", []],
                },
            }
        })
        // Set severity based on the errors array
        dataRecordQCResultsPipeline.push({
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
        dataRecordQCResultsPipeline.push({
            $match: {
                severity: {
                    $in: severities
                }
            }
        })
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
        // Filter by Batch IDs
        if (!!batchIDs && batchIDs.length > 0) {
            dataRecordQCResultsPipeline.push({
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
        if (first > 0){
            page_pipeline.push({
                $limit: first
            });
        }
        // Get paged results and total count
        dataRecordQCResultsPipeline.push({
            $facet: {
                results: page_pipeline,
                total: [{
                    $count: "total"
                }]
            }
        });
        // Extract total count from total object
        dataRecordQCResultsPipeline.push({
            $set: {
                total: {
                    $first: "$total.total",
                }
            }
        });
        // Execute pipeline
        let dataRecords = await this.dataRecordsCollection.aggregate(dataRecordQCResultsPipeline);
        dataRecords = dataRecords.length > 0 ? dataRecords[0] : {}
        dataRecords.results = this.#replaceNaN(dataRecords?.results, null);
        return {
            results: dataRecords.results || [],
            total: dataRecords.total || 0
        }
    }

    async submissionNodes(submissionID, nodeType, first, offset, orderBy, sortDirection) {
        // set orderBy
        let sort = orderBy;
        if ( !Object.keys(NODE_VIEW).includes(orderBy)) {
            if ( orderBy.indexOf(".") > 0) 
                sort = `rawData.${orderBy.replace(".", "|")}`;
            else
                sort = `props.${orderBy}`;
        }
        let pipeline = [];
        pipeline.push({
            $match: {
                submissionID: submissionID, 
                nodeType: nodeType
            }
        });
        pipeline.push({
            $project: NODE_VIEW
        });
        let page_pipeline = [];
        const nodeID= "nodeID";
        let sortFields = {
            [sort]: getSortDirection(sortDirection),
        };
        if (sort !== nodeID){
            sortFields[nodeID] = 1
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
        pipeline.push({
            $facet: {
                total: [{
                    $count: "total"
                }],
                results: page_pipeline
            }
        });
        pipeline.push({
            $set: {
                total: {
                    $first: "$total.total",
                }
            }
        });
        let dataRecords = await this.dataRecordsCollection.aggregate(pipeline);
        dataRecords = dataRecords.length > 0 ? dataRecords[0] : {}
        return {total: dataRecords.total || 0,
            results: dataRecords.results || []}
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

    #addNodeToStats(submissionStats, nodeStats, statName) {
        const stat = Stat.createStat(statName);
        nodeStats.forEach(node => {
            stat.countNodeType(node?._id, node.count);
        });
        submissionStats.addStats(stat);
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


