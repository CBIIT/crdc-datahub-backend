const fs = require('fs');
const path = require('path');
const {VALIDATION_STATUS, DATA_FILE} = require("../constants/submission-constants");
const {VALIDATION} = require("../constants/submission-constants");
const ERRORS = require("../constants/error-constants");
const {ValidationHandler} = require("../utility/validation-handler");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const {BATCH} = require("../crdc-datahub-database-drivers/constants/batch-constants.js");
const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {getFormatDateStr} = require("../utility/string-util.js")
const {arrayOfObjectsToTSV} = require("../utility/io-util.js")
const DataRecordDAO = require("../dao/dataRecords");
const {SORT} = require("../constants/db-constants");
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
const DATA_SHEET = {
    SUBJECT_ID: "participant_id",
    SAMPLE_ID: "sample_id",
    RACE: "race",
    AGE_ONSET: "age_at_diagnosis", 
    BODY_SITE: "sample_anatomic_site",
    ANALYTE_TYPE: "sample_type_category",
    IS_TUMOR: "sample_tumor_status",
    PHS_ACCESSION: "phs_accession",
    LIBRARY_ID: "library_id",
    LIBRARY_STRATEGY: "library_strategy",
    LIBRARY_SELECTION: "library_selection",
    LIBRARY_LAYOUT: "library_layout",
    PLATFORM: "platform",
    INSTRUMENT_MODEL: "instrument_model",
    DESIGN_DESCRIPTION: "design_description",
    REFERENCE_GENOME_ASSEMBLY: "reference_genome_assembly",
    SEQUENCE_ALIGNMENT_SOFTWARE: "sequence_alignment_software",
    FILE_TYPE: "file_type",
    FILE_NAME: "file_name",
    MD5SUM: "md5sum"
};
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
        this.dataRecordDAO = new DataRecordDAO();

    }

    async submissionStats(aSubmission) {
        const validNodeStatus = [VALIDATION_STATUS.NEW, VALIDATION_STATUS.PASSED, VALIDATION_STATUS.WARNING, VALIDATION_STATUS.ERROR];
        const res = await Promise.all([
            this.dataRecordDAO.getStats(aSubmission?._id, validNodeStatus),
            this.dataRecordDAO.getManyRecords(aSubmission, validNodeStatus),
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
        const [orphanedFiles, dataFiles, missingErrorFileSet] = this._dataFilesStats(uploadedFiles, fileRecords);
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
        this._saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, filteredNotFoundErrors, dataFiles);
        return submissionStats;
    }

    _dataFilesStats(s3SubmissionFiles, fileRecords) {
        s3SubmissionFiles = Array.isArray(s3SubmissionFiles) ? s3SubmissionFiles : [];
        fileRecords = Array.isArray(fileRecords) ? fileRecords : [];
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

    _saveDataFileStats(submissionStats, validatedOrphanedFiles, nonValidatedOrphanedFiles, fileNotFoundErrors, dataFiles) {
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
            const docCount = await this._getCount(submissionID);
            if (docCount === 0)  errorMessages.push(ERRORS.FAILED_VALIDATE_METADATA, ERRORS.NO_VALIDATION_METADATA);
            else {
                // updated for task CRDCDH-3001, both cross-submission and metadata need to be validated in parallel in a condition
                // if the user role is DATA_COMMONS_PERSONNEL, and the submission status is "Submitted", and aSubmission?.crossSubmissionStatus is "Error",
                if (types.includes(VALIDATION.TYPES.CROSS_SUBMISSION)) {
                    const msg = Message.createMetadataMessage("Validate Cross-submission", submissionID, null, validationID);
                    const success = await sendSQSMessageWrapper(this.awsService, msg, submissionID, this.metadataQueueName, submissionID);
                    if (!success.success)
                        errorMessages.push(ERRORS.FAILED_VALIDATE_CROSS_SUBMISSION, success.message);
                }
                if (types.includes(VALIDATION.TYPES.METADATA)) {
                    const newDocCount = await this._getCount(submissionID, scope);
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
            const fileNodes = await this._getFileNodes(submissionID, scope);
            if (fileNodes && fileNodes.length > 0) {
                const fileValidationErrors = await this._sendBatchSQSMessage(fileNodes, validationID, submissionID);
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

    async _sendBatchSQSMessage(fileNodes, validationID, submissionID) {
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
        const aNode = await this._getNode(submissionID, nodeType, nodeID);
        let nodeDetail = {
            submissionID: aNode.submissionID,
            nodeID: aNode.nodeID,
            nodeType: aNode.nodeType,
            IDPropName: aNode.IDPropName,
            parents: this._convertParents(aNode.parents),
            children: await this._getNodeChildren(submissionID, nodeType, nodeID)
        };
        return nodeDetail
    }
    async _getNode(submissionID, nodeType, nodeID){
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
    _convertParents(parents){
        parents = Array.isArray(parents) ? parents : [];
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

    async _getNodeChildren(submissionID, nodeType, nodeID){
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
        
        const aNode = await this._getNode(submissionID, nodeType, nodeID);
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
    // TODO
    async listSubmissionNodeTypes(submissionID){
        if (!submissionID){
            return []
        }

        const rows = await this.dataRecordDAO.findMany(
            { submissionID },
            {select: { nodeType: true }},
        );
        return [...new Set(rows.map(r => r?.nodeType).filter(Boolean))];
    }
    // This MongoDB schema is optimized for performance by reducing joins and leveraging document-based structure.
    async resetDataRecords(submissionID, status) {
        return await this.dataRecordsCollection.updateMany(
            { submissionID: submissionID },
            [{ $set: {
                status: status,
                updatedAt: getCurrentTime(),
                s3FileInfo: {
                    $cond: [
                        { $gt: ["$s3FileInfo.status", null] }, // only if exists
                        { $mergeObjects: ["$s3FileInfo", { status: status }] }, // override
                        "$s3FileInfo" // otherwise leave unchanged
        ]}}}]);
    }

    _getSubmissionStatQuery(submissionID, validNodeStatus) {
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

    async countNodesBySubmissionID(submissionID) {
        const countNodes = await this.dataRecordDAO.count({
            submissionID: submissionID,
        }, ['nodeType']);
         return countNodes || 0;
    }
    /**
     * public function to retrieve release record from release collection
     * @param {*} submissionID 
     * @param {*} dataCommons
     * @param {*} nodeType
     * @param {*} nodeID 
     * @param {*} status
     * @returns {Promise<Object[]>}
     */
    async getReleasedAndNewNode(submissionID, dataCommons, nodeType, nodeID, status){
        // get new node from DataRecords collection.
        const newNode = await this._getNode(submissionID, nodeType, nodeID)
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
    /**
     * createDBGaPLoadSheetForCDS
     * @param {*} aSubmission 
     * @returns string
     */
    async createDBGaPLoadSheetForCDS(aSubmission){
        const datacommon = aSubmission.dataCommons;
        const dataDefinitionSourceDir = `resources/data-definition/${datacommon}`;
        const tempFolder = `logs/${aSubmission._id}`;
        const dbGaPDir = `dbGaP_${aSubmission.dbGaPID}_${aSubmission.name}_${getFormatDateStr(getCurrentTime())}`;
        const download_dir = path.join(tempFolder, dbGaPDir);
        // 1) create subject sample mapping sheet
        const participants = await this.dataRecordsCollection.aggregate([{
            $match: {
                submissionID: aSubmission._id,
                nodeType: "participant"
            }
        }]);
        if (!participants || participants.length === 0) throw new Error(ERRORS.PARTICIPANT_NOT_FOUND);
        // create subject sample mapping by sample nodes
        const sampleNodes = await this.dataRecordsCollection.aggregate([{
            $match: {
                submissionID: aSubmission._id,
                nodeType: "sample"
            }
        }]);
        if (!sampleNodes || sampleNodes.length === 0) throw new Error(ERRORS.SAMPLE_NOT_FOUND);
        let subjectSampleMapArr = sampleNodes.map((sampleNode) => {
            const parent = sampleNode.parents.find(p=>p.parentType === "participant");
            const subject = parent ? participants.find(p => p.nodeID === parent.parentIDValue) : null;
            const subjectID = subject.props?.dbGaP_subject_id? subject.props.dbGaP_subject_id : subject.nodeID;
            const sampleID = sampleNode.props?.biosample_accession? sampleNode.props.biosample_accession: sampleNode.nodeID;
            return subjectID ? { [DATA_SHEET.SUBJECT_ID]: subjectID, [DATA_SHEET.SAMPLE_ID]: sampleID } : null;
        });
        subjectSampleMapArr = subjectSampleMapArr.filter((subjectSampleMap) => subjectSampleMap !== null);
        if (subjectSampleMapArr.length === 0 ) throw new Error(ERRORS.PARTICIPANT_SAMPLE_NOT_FOUND);
        // 2) create temp folder and save SubjectSampleMapping_DD/DS
        if (!fs.existsSync(tempFolder)) {
            fs.mkdirSync(tempFolder, { recursive: true });
        }
        if (!fs.existsSync(download_dir)) {
            fs.mkdirSync(download_dir, { recursive: true });
        }
        // copy subject Sample Mapping Dd from resource/data-definition/{datacommon}/SubjectSampleMapping_DD.xslx
        const subjectSampleMapping = `${download_dir}/${dbGaPDir}_SubjectSampleMapping`;
        const ssmsSourceFile = `${dataDefinitionSourceDir}/SubjectSampleMapping_DD.xlsx`;
        fs.copyFileSync(ssmsSourceFile, subjectSampleMapping + "_DD.xlsx");
        // save subjectSampleMapArr to tsv file
        
        const subjectSampleMap_DS = subjectSampleMapping + "_DS.txt";
        arrayOfObjectsToTSV(subjectSampleMapArr, subjectSampleMap_DS);  
        // 3) create Subject Phenotype DD and DS
        const subjectPhenotypeArr = await Promise.all(
            participants.map(async (participant) => {
            const subjectID = participant.props?.dbGaP_subject_id? participant.props.dbGaP_subject_id : participant.nodeID;
            const race = participant.props?.race;
            const ageAtDiagnosis = await this._getAgeAtDiagnosisByParticipant(participant.nodeID, aSubmission._id);
            return {[DATA_SHEET.SUBJECT_ID]: subjectID, [DATA_SHEET.RACE]: race, [DATA_SHEET.AGE_ONSET]: ageAtDiagnosis};
        }));
        if (subjectPhenotypeArr.length > 0){
            const subjectPhenotype = `${download_dir}/${dbGaPDir}_SubjectPhenotype`;
            const subjectPhenotypeSourceFile = `${dataDefinitionSourceDir}/SubjectPhenotypes_DD.xlsx`;
            fs.copyFileSync(subjectPhenotypeSourceFile, subjectPhenotype + "_DD.xlsx");
            // save subjectPhenotypeArr to tsv file
            const subjectPhenotype_DS = subjectPhenotype + "_DS.txt";
            arrayOfObjectsToTSV(subjectPhenotypeArr, subjectPhenotype_DS);
        }
        // 4) create sample attribute DD and DS
        const sampleAttributesArr = sampleNodes.map((sample) => {
            const sampleID = sample.props?.biosample_accession? sample.props.biosample_accession: sample.nodeID;
            const sampleSite= sample.props?.sample_anatomic_site;
            const sampleTypeCategory = sample.props?.sample_type_category;
            const sampleTumorStatus = (sample.props?.sample_tumor_status === "Tumor") ? 1 : 0;
            return {[DATA_SHEET.SAMPLE_ID]: sampleID, [DATA_SHEET.BODY_SITE]: sampleSite, [DATA_SHEET.ANALYTE_TYPE]: sampleTypeCategory, 
                [DATA_SHEET.IS_TUMOR]: sampleTumorStatus};
        });
        if (sampleAttributesArr.length > 0){
            const sampleAttributes = `${download_dir}/${dbGaPDir}_SampleAttributes`;
            const sampleAttributesSourceFile = `${dataDefinitionSourceDir}/SampleAttributes_DD.xlsx`;
            fs.copyFileSync(sampleAttributesSourceFile, sampleAttributes + "_DD.xlsx");
            const sampleAttributes_DS = sampleAttributes + "_DS.txt";
            // save sampleAttributesArr to tsv file
            arrayOfObjectsToTSV(sampleAttributesArr, sampleAttributes_DS);
        }
        // 5) create Sequencing Metadata (genomic_info) DS by join file and genomic_info
        const genomicInfoArr = [];
        const uniqueSampleFileSet = new Set();
        for (const sample of sampleNodes){
            const sampleID = sample.nodeID;
            const biosample_accession = sample.props?.biosample_accession? sample.props.biosample_accession: sample.nodeID;
            const sampleFiles = await this.dataRecordsCollection.aggregate([{
                $match: {
                    submissionID: aSubmission._id,
                    nodeType: "file",
                    "parents.parentType": "sample",
                    "parents.parentIDValue": sampleID
                }
            }]);
            if (sampleFiles && sampleFiles.length > 0){
               const _ = await Promise.all(
                  sampleFiles.map(async (sampleFile) => {
                    const fileID = sampleFile.nodeID;
                    const uniqueFileID = `${sampleID}_${fileID}`;
                    if (!uniqueSampleFileSet.has(uniqueFileID)){
                        uniqueSampleFileSet.add(uniqueFileID);
                        const fileName = sampleFile.props?.file_name;
                        const fileMD5 = sampleFile.props?.md5sum;
                        const fileType = sampleFile.props?.file_type;
                        const genomicInfoList = await this._getGenomicInfoByFile(fileID, aSubmission._id);
                        if (genomicInfoList && genomicInfoList.length > 0){
                            genomicInfoList.map((genomicInfo) => {
                                const libraryID = genomicInfo.props?.library_id;
                                const libraryStrategy = genomicInfo.props?.library_strategy;
                                const librarySelection = genomicInfo.props?.library_selection;
                                const libraryLayout = genomicInfo.props?.library_layout;
                                const platform = genomicInfo.props?.platform;
                                const instrumentModel = genomicInfo.props?.instrument_model;
                                const designDescription = genomicInfo.props?.design_description;
                                const reference_genome_assembly = genomicInfo.props?.reference_genome_assembly;
                                const alignemnt_software = genomicInfo.props?.sequence_alignment_software;
                                genomicInfoArr.push({[DATA_SHEET.PHS_ACCESSION]: aSubmission.dbGaPID, [DATA_SHEET.SAMPLE_ID]: biosample_accession, 
                                    [DATA_SHEET.LIBRARY_ID]: libraryID, [DATA_SHEET.LIBRARY_STRATEGY]: libraryStrategy, 
                                    [DATA_SHEET.LIBRARY_SELECTION]: librarySelection, [DATA_SHEET.LIBRARY_LAYOUT]: libraryLayout, 
                                    [DATA_SHEET.PLATFORM]: platform,[DATA_SHEET.INSTRUMENT_MODEL]: instrumentModel, 
                                    [DATA_SHEET.DESIGN_DESCRIPTION]: designDescription,
                                    [DATA_SHEET.REFERENCE_GENOME_ASSEMBLY]: reference_genome_assembly,
                                    [DATA_SHEET.SEQUENCE_ALIGNMENT_SOFTWARE]: alignemnt_software,
                                    [DATA_SHEET.FILE_TYPE]: fileType, [DATA_SHEET.FILE_NAME]: fileName, [DATA_SHEET.MD5SUM]: fileMD5});
                            });
                        }
                    }
                    return true;
                }));
            }
        }
        
        if (genomicInfoArr.length > 0){
            const sequenceMetadata = `${download_dir}/${dbGaPDir}_SequenceMetadata_DD`;
            const sequenceMetadataSourceFile = `${dataDefinitionSourceDir}/SequenceMetadata_DD.xlsx`;
            fs.copyFileSync(sequenceMetadataSourceFile, sequenceMetadata + ".xlsx");
            const sequencingMetadata_DS = `${download_dir}/${dbGaPDir}_SequencingMetadata_DS.txt`;
            // save Sequencing Metadata to tsv file
            arrayOfObjectsToTSV(genomicInfoArr, sequencingMetadata_DS);
        }
        return download_dir;
    }
    /**
     * #getAgeAtDiagnosisByParticipant
     * @param {*} subjectID
     * @param {*} submissionID
     * @returns int
     */
    async _getAgeAtDiagnosisByParticipant(subjectID, submissionID){
        const diagnosis = await this.dataRecordsCollection.aggregate([{
            $match: {
                submissionID: submissionID,
                nodeType: "diagnosis",
                "parents.parentType": "participant",
                "parents.parentIDValue": subjectID
            }
        }, {$limit: 1}]);
        return diagnosis && diagnosis.length > 0 ? (diagnosis[0].props.age_at_diagnosis) : null;
    }
    /**
     * #getGenomicInfoByFile
     * @param {*} fileID 
     * @returns array
     * @param {*} submissionID
     */
    async _getGenomicInfoByFile(fileID, submissionID){
        const genomicInfos = await this.dataRecordsCollection.aggregate([{
            $match: {
                submissionID: submissionID,
                nodeType: "genomic_info",
                "parents.parentType": "file",
                "parents.parentIDValue": fileID
            }
        }]);
        return genomicInfos.length > 0 ?  genomicInfos : [];
    }

    async _getCount(submissionID, status = null) {
        const query = (!status)? {submissionID: submissionID} : {submissionID: submissionID, status: status} ;
        return await this.dataRecordsCollection.countDoc(query);
    }

    async _getFileNodes(submissionID, scope) {
        const isNewScope = scope?.toLowerCase() === VALIDATION.SCOPE.NEW.toLowerCase();
        const fileNodes = await this.dataRecordsCollection.aggregate([{
            $match: {
                s3FileInfo: { $exists: true, $ne: null},
                submissionID: submissionID,
                // case-insensitive search
                ...(isNewScope ? { "s3FileInfo.status": { $regex: new RegExp("^" + VALIDATION.SCOPE.NEW + "$", "i") } } : {})}},
            {$sort: {"s3FileInfo.size": 1}}
        ]);
        return fileNodes || [];
    }
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

    _addTotal(total) {
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
        this._addTotal(count);
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
    NODE_RELATION_TYPES,
    Message,
    Stat,
    SubmissionStats
};
