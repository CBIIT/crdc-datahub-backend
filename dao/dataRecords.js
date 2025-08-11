const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const prisma = require("../prisma");
const {VALIDATION_STATUS} = require("../constants/submission-constants");

class DataRecordDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.DATA_RECORDS);
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