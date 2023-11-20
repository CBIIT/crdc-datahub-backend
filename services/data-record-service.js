const {NODE_TYPE} = require("../constants/submission-constants");

class DataRecordService {
    constructor(dataRecordsCollection) {
        this.dataRecordsCollection = dataRecordsCollection;
    }

    async submissionStats(submissionID) {
        const groupPipeline = { "$group": { _id: "$nodeType", count: { $sum: 1 }} };
        const groupByNodeType = await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, status: {$in: [NODE_TYPE.NEW, NODE_TYPE.PASSED, NODE_TYPE.WARNING, NODE_TYPE.ERROR]}}}, groupPipeline]);

        const statusPipeline = { "$group": { _id: "$status", count: { $sum: 1 }} };
        const promises = groupByNodeType.map(async node =>
            [await this.dataRecordsCollection.aggregate([{ "$match": {submissionID: submissionID, nodeType: node?._id}}, statusPipeline]), node?._id]
        );
        const submissionStatsRecords = await Promise.all(promises) || [];
        const submissionStats = SubmissionStats.createSubmissionStats(submissionID);
        submissionStatsRecords.forEach(aStatSet => {
            const [nodes, nodeName] = aStatSet;
            const stat = Stat.createStat(nodeName);
            nodes.forEach((node) => {
                stat.countNodeType(node?._id);
            });
            submissionStats.addStats(stat);
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

    countNodeType(node) {
        if (node === NODE_TYPE.NEW) {
            this.new += 1;
            this.#addTotal();
        }
        if (node ===NODE_TYPE.ERROR) {
            this.error += 1;
            this.#addTotal();
        }
        if (node ===NODE_TYPE.WARNING) {
            this.warning += 1;
            this.#addTotal();
        }
        if (node ===NODE_TYPE.PASSED) {
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


