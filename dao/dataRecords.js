const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const prisma = require("../prisma");
const {VALIDATION_STATUS} = require("../constants/submission-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
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
class DataRecordDAO extends GenericDAO {
    constructor(dataRecordsCollection) {
        super(MODEL_NAME.DATA_RECORDS);
        this.dataRecordsCollection = dataRecordsCollection;
    }

    // note: prisma can’t sort by nested JSON paths like rawData.some|field
    async getSubmissionNodes(submissionID, nodeType, first, offset, orderBy, sortDirection, query=null) {
        // set orderBy
        let sort = orderBy;
        if (!Object.keys(NODE_VIEW).includes(orderBy)) {
            sort = orderBy.indexOf(".") > 0 ? `rawData.${orderBy.replace(".", "|")}` : sort = `props.${orderBy}`
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


    async getManyRecords(aSubmission, validNodeStatus) {
        return this.findMany(
            {
                submissionID: aSubmission._id,
                s3FileInfo: {
                    is: {
                        status: { in: validNodeStatus }
                    }
                }
            },
            {
                select: {
                    s3FileInfo: {
                        select: {
                            status: true,
                            fileName: true
                        }
                    }
            }
        });
    }
}

module.exports = DataRecordDAO