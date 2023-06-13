const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW} = require("../constants/application-constants");
const {HistoryEventBuilder} = require("../domain/history-event");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
class Application {
    constructor(dbService) {
        this.dbService = dbService;
    }

    async getApplicationById(id) {
        return await this.dbService.find(APPLICATION, {_id: id});
    }

    async submitApplication(document, _) {
        let result = [];
        const application = await this.getApplicationById(document._id);
        const isValid = application.length > 0 && application[0].status ? application[0].status != SUBMITTED : false;
        if (isValid && application[0].status != IN_PROGRESS) throw Error("Invalid Application Submission - Previous State 'In Progress' required");
        if (isValid) {
            // In Progress -> In Submitted
            const history = HistoryEventBuilder.createEvent({status: SUBMITTED});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: SUBMITTED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : [];
        }
        return result.length > 0 ? result[0] : null;
    }

    async reopenApplication(document, _) {
        const application = await this.getApplicationById(document._id);
        // TODO 1. If Reviewer opened the application, the status changes to IN_REVIEW
        // TODO 2. THe application status changes from rejected to in-progress when the user opens the rejected application
        if (application.length > 0 && application[0].status) {
            const history = HistoryEventBuilder.createEvent({status: IN_PROGRESS});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: IN_PROGRESS, updatedAt: history.dateTime},
                $push: {history}
            });
            const result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : [];
            return result.length > 0 ? result[0] : {};
        }
        return application.length > 0 ? application[0] : null;
    }

    async deleteApplication(document, _) {
        const deletedOne = await this.getApplicationById(document._id);
        let result = null;
        if (deletedOne && await this.dbService.deleteOne(APPLICATION, {_id: document._id})) {
            result = deletedOne[0];
        }
        return result;
    }

    async approveApplication(document) {
        let result = [];
        const application = await this.getApplicationById(document._id);
        const isValid = application.length > 0 && application[0].status;
        // In Reviewed -> Approved
        if (isValid && application[0].status != IN_REVIEW) throw Error("Invalid Application Submission - Previous State 'In Review' required");
        if (isValid) {
            const history = HistoryEventBuilder.createEvent({status: APPROVED, comment: document.comment});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {reviewComment: document.comment, wholeProgram: document.wholeProgram, status: APPROVED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : [];
        }
        return result.length > 0 ? result[0] : null;
    }

    async rejectApplication(document, _) {
        let result = [];
        const application = await this.getApplicationById(document._id);
        const isValid = application.length > 0 && application[0].status;
        // In Reviewed -> Rejected
        if (isValid && application[0].status != IN_REVIEW) throw Error("Invalid Application Submission - Previous State 'In Review' required");
        if (isValid) {
            const history = HistoryEventBuilder.createEvent({status: REJECTED, comment: document.comment});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : [];
        }
        return result.length > 0 ? result[0] : null;
    }
}

module.exports = {
    Application
};
