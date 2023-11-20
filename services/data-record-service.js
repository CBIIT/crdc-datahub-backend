const {NODE_STATUS} = require("../constants/submission-constants");

class DataRecordService {
    constructor(dataRecordsCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
    }

    async submissionStats(params) {
        const groupPipeline = { "$group": { _id: "$nodeType", count: { $sum: 1 }} };
        const groupByNodeType = await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: params?.submissionID, status: {$in: [NODE_STATUS.NEW, NODE_STATUS.PASSED, NODE_STATUS.WARNING, NODE_STATUS.ERROR]}}}, groupPipeline]);

        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }} };
        const promises = groupByNodeType.map(node =>
            [this.dataRecordsCollection.aggregate([{ "$match": {submissionID: params?.submissionID, nodeType: node?._id}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(params?.submissionID);
        submissionStatsRecords.forEach(aSubmissionStat => {
            const [nodes, nodeName] = aSubmissionStat;
            const stat = Stat.createStat(nodeName);
            const result = nodes.map((node) => {
                stat.countNode(node?._id);
            });
            submissionStats.addStats(result);
        });
        return submissionStats;
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

    #addTotal() {
        this.total += 1;
    }

    countNode(node) {
        if (node === NODE_STATUS.NEW) {
            this.new += 1;
            this.#addTotal();
        }
        if (node ===NODE_STATUS.ERROR) {
            this.error += 1;
            this.#addTotal();
        }
        if (node ===NODE_STATUS.WARNING) {
            this.warning += 1;
            this.#addTotal();
        }
        if (node ===NODE_STATUS.PASSED) {
            this.passed += 1;
            this.#addTotal();
        }
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


