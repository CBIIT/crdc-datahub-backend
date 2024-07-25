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
    parents: "$parents",
    rawData: "$rawData"
}
const NODE_RELATION_TYPE_PARENT="parent";
const NODE_RELATION_TYPE_CHILD="child";
const NODE_RELATION_TYPES = [NODE_RELATION_TYPE_PARENT, NODE_RELATION_TYPE_CHILD];

const FILE = "file";
class DataRecordService {
    constructor(dataRecordsCollection, fileQueueName, metadataQueueName, awsService, s3Service) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
        this.s3Service = s3Service;
    }

    async submissionStats(aSubmission) {
        const groupPipeline = { "$group": { _id: "$nodeType", count: { $sum: 1 }} };
        const validNodeStatus = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        const res = await Promise.all([
            this.dataRecordsCollection.aggregate([{ "$match": {submissionID: aSubmission?._id, status: {$in: validNodeStatus}}}, groupPipeline]),
            this.dataRecordsCollection.aggregate([
                { "$match": {submissionID: aSubmission?._id, "s3FileInfo.status": {$in: validNodeStatus}}}]),
            // submission's root path should be matched, otherwise the other file node count return wrong
            await this.s3Service.listFile(aSubmission.bucketName, `${aSubmission.rootPath}/${FILE}`)
        ]);
        const [groupByNodeType, fileRecords, s3SubmissionFiles] = res;
        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }}};
        const promises = groupByNodeType.map(async node =>
            [await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: aSubmission?._id, nodeType: node?._id, status: {$in: validNodeStatus}}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(aSubmission?._id);
        submissionStatsRecords.forEach(aStatSet => {
            const [nodes, nodeName] = aStatSet;
            const stat = Stat.createStat(nodeName);
            nodes.forEach(node => {
                stat.countNodeType(node?._id, node.count);
            });
            if (stat.total > 0) {
                submissionStats.addStats(stat);
            }
        });
        const uploadedFiles = s3SubmissionFiles?.Contents
            .filter((f)=> f && f.Key !== `${aSubmission.rootPath}/${FILE}/`)
            .map((f)=> f.Key.replace(`${aSubmission.rootPath}/${FILE}/`, ''));
        // This dataFiles represents the intersection of the orphanedFiles.
        const [orphanedFiles, dataFiles] = this.#dataFilesStats(uploadedFiles, fileRecords);
        this.#saveDataFileStats(submissionStats, orphanedFiles, dataFiles, uploadedFiles?.length, aSubmission);
        return [orphanedFiles, submissionStats];
    }


    #dataFilesStats(s3SubmissionFiles, fileRecords) {
        const s3FileSet = new Set(s3SubmissionFiles);
        const fileDataRecordsMap = new Map(fileRecords.map(file => [file?.s3FileInfo?.fileName, file?.s3FileInfo]));
        const orphanedFiles = [];
        s3FileSet.forEach(file => {
            if (!fileDataRecordsMap.has(file)) {
                orphanedFiles.push(file);
            }
        });

        const dataFiles = Array.from(fileDataRecordsMap.values());
        return [orphanedFiles, dataFiles];
    }

    #saveDataFileStats(submissionStats, orphanedFiles, dataFiles, totalCount, aSubmission) {
        const stat = Stat.createStat(DATA_FILE);
        // submission error should be under data file's s3FileInfo.status == "Error", plus count of orphanedFiles
        stat.countNodeType(VALIDATION_STATUS.ERROR, orphanedFiles.length);
        // submission warning should be under data file's s3FileInfo.status == "Warning", plus count of Submission.fileWarnings
        aSubmission?.fileWarnings?.forEach(file => {
            if (file?.type === DATA_FILE) {
                stat.countNodeType(VALIDATION_STATUS.WARNING, 1);
            }
        });

        dataFiles.forEach(node => {
            stat.countNodeType(node?.status, 1);
        });

        if (stat.total > 0) {
            // The total is the number of files uploaded to S3
            // stat.total = totalCount;
            submissionStats.addStats(stat);
        }
    }

    async validateMetadata(submissionID, types, scope, validationID) {
        isValidMetadata(types, scope);
        const isMetadata = types.some(t => t === VALIDATION.TYPES.METADATA || t === VALIDATION.TYPES.CROSS_SUBMISSION);
        let errorMessages = [];
        if (isMetadata) {
            const docCount = await getCount(this.dataRecordsCollection, submissionID);
            if (docCount === 0)  errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, ERRORS.NO_VALIDATION_METADATA);
            else {
                if (types.includes(VALIDATION.TYPES.CROSS_SUBMISSION)) {
                    const msg = Message.createMetadataMessage("Validate Cross-submission", submissionID, null, validationID);
                    const success = await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.metadataQueueName, submissionID);
                    if (!success.success)
                        errorMessages.push(ERRORS.FAILED_VALIDATE_CROSS_SUBMISSION, success.message);
                } else {
                    const newDocCount = await getCount(this.dataRecordsCollection, submissionID, scope);
                    if (!(scope.toLowerCase() === VALIDATION.SCOPE.NEW && newDocCount === 0)) {
                        const msg = Message.createMetadataMessage("Validate Metadata", submissionID, scope, validationID);
                        const success = await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.metadataQueueName, submissionID);
                        if (!success.success)
                            errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, success.message)
                    }
                    else {
                        errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, ERRORS.NO_NEW_VALIDATION_METADATA);
                    }
                }
            }
        }
        const isFile = types.some(t => (t?.toLowerCase() === VALIDATION.TYPES.DATA_FILE || t?.toLowerCase() === VALIDATION.TYPES.FILE));
        if (isFile) {
            let fileValidationErrors = [];
            const fileNodes = await getFileNodes(this.dataRecordsCollection, submissionID, scope);
            if (fileNodes && fileNodes.length > 0) {
                for (const aFile of fileNodes) {
                    const msg = Message.createFileNodeMessage("Validate File", aFile._id, validationID);
                    const result = await sendSQSMessageWrapper(this.awsService, msg, aFile._id, this.fileQueueName, submissionID);
                    if (!result.success)
                        fileValidationErrors.push(result.message);
                }
            }
            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID, validationID);
            const result= await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.fileQueueName, submissionID);
            if (!result.success)
                fileValidationErrors.push(result.message);

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
        // Lookup Batch data
        dataRecordQCResultsPipeline.push({
            $lookup: {
                from: "batch",
                localField: "latestBatchID",
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
                    "$datafile_results"
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
                batchID: "$latestBatchID",
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
        const dataRecords = this.#replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }

    async submissionCrossValidationResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection){
        let dataRecordQCResultsPipeline = [];
        // Filter by submission ID
        dataRecordQCResultsPipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
        // Lookup Batch data
        dataRecordQCResultsPipeline.push({
            $lookup: {
                from: "batch",
                localField: "latestBatchID",
                foreignField: "_id",
                as: "batch",
            }
        });
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
                    }
                }
            }
        });
        // Reformat documents
        dataRecordQCResultsPipeline.push({
            $project: {
                submissionID: 1,
                type: "$results.type",
                validationType: "$results.validation_type",
                batchID: "$latestBatchID",
                displayID: {
                    $first: "$batch.displayID",
                },
                submittedID: "$submittedID",
                uploadedDate: "$updatedAt",
                validatedDate: "$validatedAt",
                errors: "$additionalErrors",
                warnings: [],
                // convert array of arrays into a single set of values
                conflictingSubmissions: {
                    $setUnion: {
                        $reduce: {
                            input: '$additionalErrors.conflictingSubmissions',
                            initialValue: [],
                            in: {$concatArrays: ['$$value', '$$this']}
                        }
                    }
                },
                severity: VALIDATION_STATUS.ERROR
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
        const dataRecords = this.#replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }

    async deleteMetadataByFilter(filter){
        return await this.dataRecordsCollection.deleteMany(filter);
    }

    async submissionNodes(submissionID, nodeType, first, offset, orderBy, sortDirection, query=null) {
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
            $match: (!query)?{
                submissionID: submissionID, 
                nodeType: nodeType
            }:query
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
        // if -1, returns all data of given node & ignore offset
        if (first !== -1) {
            page_pipeline.push({
                $skip: offset
            });
            page_pipeline.push({
                $limit: first
            });
        }

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

    async submissionDataFiles(submissionID, s3FileNames) {
        let pipeline = [];
        pipeline.push({
            $match: {
                submissionID: submissionID, 
                s3FileInfo: {$exists: true, $ne: null},
                "s3FileInfo.fileName": {$in: s3FileNames}
            }
        });
        pipeline.push({
            $project: {
                _id: 0,
                nodeID: "$s3FileInfo.fileName",
                status:  "$s3FileInfo.status",
            }
        });
        return await this.dataRecordsCollection.aggregate(pipeline);
    }

    async NodeDetail(submissionID, nodeType, nodeID){
        const aNode = await this.#GetNode(submissionID, nodeType, nodeID);
        let nodeDetail = {
            submissionID: aNode.submissionID,
            nodeID: aNode.nodeID,
            nodeType: aNode.nodeType,
            IDPropName: aNode.IDPropName,
            parents: this.#ConvertParents(aNode.parents),
            children: await this.#GetNodeChildren(submissionID, nodeType, nodeID)
        };
        return nodeDetail
    }
    async #GetNode(submissionID, nodeType, nodeID){
        const aNodes = await this.dataRecordsCollection.aggregate([{
            $match: {
                nodeID: nodeID,
                nodeType: nodeType,
                submissionID: submissionID
            }},
            {$limit: 1}
        ]);
        if(aNodes.length === 0){
            throw new Error(ERRORS.INVALID_NODE_NOT_FOUND);
        }
        else 
            return aNodes[0];
    }
    #ConvertParents(parents){
        let convertedParents = [];
        let parentTypes = new Set();
        for (let parent of parents){
            parentTypes.add(parent.parentType)
        }
        parentTypes.forEach((parentType) => {
            convertedParents.push({nodeType: parentType, total: parents.filter((parent) => parent.parentType === parentType).length});
        });
        return convertedParents ;
    }

    async #GetNodeChildren(submissionID, nodeType, nodeID){
        let convertedChildren= [];
        // get children
        const children = await this.dataRecordsCollection.aggregate([{
            $match: {
                "parents.parentIDValue": nodeID,
                "parents.parentType": nodeType,
                submissionID: submissionID
            }}
        ]);
        let childTypes = new Set();
        for (let child of children){
            childTypes.add(child.nodeType)
        }
        childTypes.forEach((childType) => {
            convertedChildren.push({nodeType: childType, total:children.filter((child) => child.nodeType === childType).length});
        });
        return convertedChildren;
    }

    async RelatedNodes(param){
        const {
            submissionID, 
            nodeType, 
            nodeID, 
            relationship,
            relatedNodeType,
            first,
            offset,
            orderBy,
            sortDirection} = param;
        
        const aNode = await this.#GetNode(submissionID, nodeType, nodeID);
        let query = null;
        let IDPropName = null;
        switch (relationship) {
            case NODE_RELATION_TYPE_PARENT:
                const parents = aNode.parents?.filter(p=>p.parentType === relatedNodeType);
                if (parents.length === 0){
                    throw new Error(ERRORS.INVALID_NO_PARENTS_FOUND);
                }
                query = {
                    "submissionID": submissionID,
                    "nodeID": {$in: parents.map(p=>p.parentIDValue)},
                    "nodeType": relatedNodeType
                };
                IDPropName = parents[0].parentIDPropName;
                break;
            case NODE_RELATION_TYPE_CHILD:
                query = {
                    submissionID: submissionID,
                    nodeType: relatedNodeType,
                    "parents.parentIDValue": nodeID,
                    "parents.parentType": nodeType
                };
                break;
            default:
                throw new Error(ERRORS.INVALID_NODE_RELATIONSHIP);
        }
        const result = await this.submissionNodes(submissionID, nodeType, first, offset, orderBy, sortDirection, query); 
        IDPropName = (IDPropName) ? IDPropName : (result.total > 0)? result.results[0].IDPropName : null;
        return [result, IDPropName];
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
            s3FileInfo: { $exists: true, $ne: null},
            submissionID: submissionID,
            // case-insensitive search
            ...(isNewScope ? { "s3FileInfo.status": { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}},
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
    const isValidTypes = types.every(t => (t?.toLowerCase() === VALIDATION.TYPES.DATA_FILE
        || t?.toLowerCase() === VALIDATION.TYPES.FILE
        || t?.toLowerCase() === VALIDATION.TYPES.METADATA)
        || t?.toLowerCase() === VALIDATION.TYPES.CROSS_SUBMISSION);

    if (!isValidTypes) {
        throw new Error(ERRORS.INVALID_SUBMISSION_TYPE);
    }
    // cross-submission does not require a scope
    const isNonCrossSubmission = types.some(t => (t?.toLowerCase() !== VALIDATION.TYPES.CROSS_SUBMISSION));
    // case-insensitive
    const isValidScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase() || scope?.toLowerCase() === VALIDATION.SCOPE.ALL.toLowerCase();
    if (isNonCrossSubmission && !isValidScope) {
        throw new Error(ERRORS.INVALID_SUBMISSION_SCOPE);
    }
}

class Message {
    constructor(type, validationID) {
        this.type = type;
        if (validationID) {
            this.validationID = validationID;
        }
    }
    static createMetadataMessage(type, submissionID, scope, validationID) {
        const msg = new Message(type, validationID);
        msg.submissionID = submissionID;
        if (scope) {
            msg.scope= scope;
        }
        return msg;
    }

    static createFileSubmissionMessage(type, submissionID, validationID) {
        const msg = new Message(type, validationID);
        msg.submissionID = submissionID;
        return msg;
    }

    static createFileNodeMessage(type, dataRecordID, validationID) {
        const msg = new Message(type, validationID);
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
    DataRecordService, 
    NODE_RELATION_TYPES
};
