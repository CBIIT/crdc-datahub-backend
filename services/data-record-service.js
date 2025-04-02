const {VALIDATION_STATUS, DATA_FILE} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants.js");
const BATCH_SIZE = 300;
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
    constructor(dataRecordsCollection, dataRecordArchiveCollection, releaseCollection, fileQueueName, metadataQueueName, awsService, s3Service, qcResultsService, exportQueue) {
        this.dataRecordsCollection = dataRecordsCollection;
        this.fileQueueName = fileQueueName;
        this.metadataQueueName = metadataQueueName;
        this.awsService = awsService;
        this.s3Service = s3Service;
        this.dataRecordArchiveCollection = dataRecordArchiveCollection;
        this.qcResultsService = qcResultsService;
        this.exportQueue = exportQueue;
        this.releaseCollection = releaseCollection;

    }

    async submissionStats(aSubmission) {
        const validNodeStatus = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        const submissionQuery = this.#getSubmissionStatQuery(aSubmission?._id, validNodeStatus);
        const res = await Promise.all([
            this.dataRecordsCollection.aggregate(submissionQuery),
            this.dataRecordsCollection.aggregate([
                {"$match": {submissionID: aSubmission?._id, "s3FileInfo.status": {$in: validNodeStatus}}},
                {"$project": {"s3FileInfo.status": 1,"s3FileInfo.fileName": 1,}}
            ]),
            // submission's root path should be matched, otherwise the other file node count return wrong
            this.s3Service.listFileInDir(aSubmission.bucketName, `${aSubmission.rootPath}/${FILE}/`),
            // search for the orphaned file errors
            this.qcResultsService.findBySubmissionErrorCodes(aSubmission?._id, ERRORS.CODES.F008_MISSING_DATA_NODE_FILE),
            // search for the missing file errors
            this.qcResultsService.findBySubmissionErrorCodes(aSubmission?._id, ERRORS.CODES.F001_FILE_MISSING_FROM_BUCKET)
        ]);
        const [submissionStatsRes, fileRecords, s3SubmissionFiles, submissionErrorFiles, notFoundErrorFiles] = res;
        const submissionStats = submissionStatsRes?.pop() || {};
        const uploadedFiles = s3SubmissionFiles
            ?.filter((f)=> f && f.Key !== `${aSubmission.rootPath}/${FILE}/`)
            ?.map((f)=> f.Key.replace(`${aSubmission.rootPath}/${FILE}/`, ''));
        // This dataFiles represents the intersection of the orphanedFiles.
        const [orphanedFiles, dataFiles, missingErrorFileSet] = this.#dataFilesStats(uploadedFiles, fileRecords);
        const orphanedFileNameSet = new Set(submissionErrorFiles
            ?.map((f) => f?.submittedID));

        const [validatedOrphanedFiles, nonValidatedOrphanedFiles] = orphanedFiles.reduce(
            ([validated, nonValidated], file) => {
                orphanedFileNameSet.has(file) ? validated.push(file) : nonValidated.push(file);
                return [validated, nonValidated];
            },
            [[], []]
        );

        const filteredNotFoundErrors = notFoundErrorFiles.filter((f) => missingErrorFileSet.has(f?.submittedID));
        this.#saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, filteredNotFoundErrors, dataFiles);
        return submissionStats;
    }

    #dataFilesStats(s3SubmissionFiles, fileRecords) {
        const s3FileSet = new Set(s3SubmissionFiles);
        const fileDataRecordsMap = new Map(fileRecords.map(file => [file?.s3FileInfo?.fileName, file?.s3FileInfo]));
        const [orphanedFiles, missingErrorFileSet, dataFiles] = [[], new Set(), []];
        s3FileSet.forEach(file => {
            if (fileDataRecordsMap.has(file)) {
                dataFiles.push(fileDataRecordsMap.get(file));
            } else {
                orphanedFiles.push(file);
            }
        });

        fileRecords.forEach(file => {
            if (!s3FileSet.has(file?.s3FileInfo?.fileName) && file?.s3FileInfo?.status === ERROR) {
                missingErrorFileSet.add(file?.s3FileInfo?.fileName);
            }
        });

        return [orphanedFiles, dataFiles, missingErrorFileSet];
    }

    #saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles) {
        const stat = Stat.createStat(DATA_FILE);
        stat.countNodeType(VALIDATION_STATUS.NEW, nonValidatedOrphanedFiles.length);
        stat.countNodeType(VALIDATION_STATUS.ERROR, validatedOrphanedFiles.length + fileNotFoundErrors.length);

        const validStatusSet = new Set([VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.ERROR, VALIDATION_STATUS.WARNING]);
        dataFiles.forEach(node => {
            if (validStatusSet.has(node?.status)) {
                stat.countNodeType(node?.status, 1);
            }
        });

        if (stat.total > 0) {
            submissionStats.stats = submissionStats?.stats || [];
            submissionStats.stats.push(stat);
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
            const fileNodes = await getFileNodes(this.dataRecordsCollection, submissionID, scope);
            if (fileNodes && fileNodes.length > 0) {
                const fileValidationErrors = await this.#sendBatchSQSMessage(fileNodes, validationID, submissionID);
                if (fileValidationErrors.length > 0)
                    errorMessages.push(ERRORS.FAILED_VALIDATE_FILE, ...fileValidationErrors)
            }
            const msg = Message.createFileSubmissionMessage("Validate Submission Files", submissionID, validationID);
            const result= await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.fileQueueName, submissionID);
            if (!result.success)
                errorMessages.push(result.message);
        }
        return (errorMessages.length > 0) ? ValidationHandler.handle(errorMessages) : ValidationHandler.success();
    }

    async #sendBatchSQSMessage(fileNodes, validationID, submissionID) {
        let fileValidationErrors = [];
        for (let i = 0; i < fileNodes.length; i += BATCH_SIZE) {
            const batch = fileNodes.slice(i, i + BATCH_SIZE);
            const validationPromises = batch.map(async (aFile) => {
                const msg = Message.createFileNodeMessage("Validate File", aFile._id, validationID);
                const result = await sendSQSMessageWrapper(this.awsService, msg, aFile._id, this.fileQueueName, submissionID);
                if (!result.success) {
                    return result.message;
                }
                return null;
            });
            const batchErrors = (await Promise.all(validationPromises)).filter(error => error !== null);
            fileValidationErrors = fileValidationErrors.concat(batchErrors);
        }
        return fileValidationErrors;
    }

    async exportMetadata(submissionID) {
        const msg = Message.createFileSubmissionMessage("Export Metadata", submissionID);
        return await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.exportQueue, submissionID);
    }

    async submissionCrossValidationResults(submissionID, nodeTypes, batchIDs, severities, first, offset, orderBy, sortDirection){
        let dataRecordQCResultsPipeline = [];
        // Filter by submission ID
        dataRecordQCResultsPipeline.push({
            $match: {
                submissionID: submissionID
            }
        });
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
        const dataRecords = this.#replaceNaN(pagedPipelineResult, null);
        return {
            results: dataRecords || [],
            total: totalRecords || 0
        }
    }

    async deleteMetadataByFilter(filter){
        return await this.dataRecordsCollection.deleteMany(filter);
    }

    async archiveMetadataByFilter(filter){
        const dataArray = await this.dataRecordsCollection.aggregate([{"$match":filter}]);
        if (dataArray.length === 0) return null
        const promiseArray = [
            await this.dataRecordArchiveCollection.insertMany(dataArray), // Insert documents into destination
            await this.deleteMetadataByFilter(filter)      // Delete documents from source
        ];
        // Step 2: Execute all promises in parallel
        return await Promise.all(promiseArray);
        
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
        }
        const filter = {
            submissionID: submissionID
        };
        return await this.dataRecordsCollection.distinct("nodeType", filter);
    }

    #getSubmissionStatQuery(submissionID, validNodeStatus) {
        return [
            {$match:{
                    submissionID: submissionID,
                    status: {$in: validNodeStatus}
            }},
            {$group:{
                    _id: {submissionID: "$submissionID"},
                    nodeAndStatus: {
                        $push: {
                            nodeType: "$nodeType",
                            status: "$status"
                        }
            }}},
            {$unwind:{
                    path: "$nodeAndStatus"
            }},
            {$set:{
                    new: {
                        $cond: [{$eq: ["$nodeAndStatus.status", VALIDATION_STATUS.NEW]},{$sum: 1},0]
                    },
                    passed: {
                        $cond: [{$eq: ["$nodeAndStatus.status", VALIDATION_STATUS.PASSED]},{$sum: 1},0]
                    },
                    error: {
                        $cond: [{$eq: ["$nodeAndStatus.status", VALIDATION_STATUS.ERROR]}, {$sum: 1},0]},
                    warning: {
                        $cond: [{$eq: ["$nodeAndStatus.status", VALIDATION_STATUS.WARNING]},{$sum: 1}, 0]
                    }
            }},
            {$group: {
                    _id: {
                        submissionID: "$_id.submissionID",
                        nodeName: "$nodeAndStatus.nodeType"
                    },
                    new: {$sum: "$new"},
                    passed: {$sum: "$passed"},
                    warning: {$sum: "$warning"},
                    error: {$sum: "$error"}
            }},
            {$project: {
                    submissionID: "$_id.submissionID",
                    stats: {
                        nodeName: "$_id.nodeName",
                        new: "$new",
                        passed: "$passed",
                        warning: "$warning",
                        error: "$error",
                        total: {
                            $add: ["$new", "$passed", "$warning", "$error"]
                        }
                    }
            }},
            {$group: {
                    _id: {
                        submissionID: "$submissionID",
                    },
                    stats: {
                        $push: "$stats"
                    }
            }},
            {$project: {
                    _id: 0,
                    submissionID: "$_id.submissionID",
                    stats: 1
            }}
        ]
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

    async countNodesBySubmissionID(submissionID) {
        const countNodes = await this.dataRecordsCollection.aggregate([
            { $match: { submissionID } },              // Filter by submissionID
            { $group: { _id: "$_id" } },          // Group by distinct nodeType
            { $count: "count" }        // Count the distinct nodeType values
        ]);
        return countNodes.length > 0 ? countNodes[0].count : 0;
    }
    /**
     * public function to retrieve release record from release collection
     * @param {*} submissionID 
     * @param {*} nodeType 
     * @param {*} nodeID 
     * @param {*} nodeStatus 
     * @returns {Promise<Object[]>}
     */
    async getReleasedAndNewNode(submissionID, dataCommons, nodeType, nodeID, status){
        // get new node from DataRecords collection.
        const newNode = await this.#GetNode(submissionID, nodeType, nodeID)
        if(!newNode){
            throw new Error(ERRORS.INVALID_NODE_NOT_FOUND);
        }
        newNode.props = JSON.stringify(newNode.props);

        // get release node
        const query = {
            dataCommons: dataCommons,
            nodeType: nodeType,
            nodeID: nodeID,
            status: status
        };
        const results = await this.releaseCollection.aggregate([{
            $match: query
        }]);

        if(results.length === 0){
            throw new Error(ERRORS.INVALID_RELEASED_NODE_NOT_FOUND);
        }
        const releaseNode = results[0];
        releaseNode.status = status;
        releaseNode.props = JSON.stringify(releaseNode.props);
        return [newNode, releaseNode]
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
