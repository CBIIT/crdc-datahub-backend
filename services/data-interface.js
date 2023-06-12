const {APPLICATION} = require("../constants/mongo-db-constants");
const {v4} = require('uuid');
const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW} = require("../constants/application-constants");
const {EventBuilder} = require("../domain/EventBuilder");

class Application {
    constructor(dbService) {
        this.dbService = dbService;
    }

    async getApplicationById(id) {
        return await this.dbService.find(APPLICATION, {_id: id});
    }

    async submitApplication(document) {
        let result = {};
        const application = await this.getApplicationById(document._id);
        const isValid = application.length > 0 && application[0].status ? application[0].status != SUBMITTED : false;
        if (isValid && application[0].status != IN_PROGRESS) throw Error("Invalid Application Submission - Previous State 'In Progress' required");
        if (isValid) {
            // In Progress -> In Submitted
            const history = EventBuilder.createEvent({status: SUBMITTED});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {status: SUBMITTED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : {};
        }
        return (result) ? result[0] : {};
    }

    async reopenApplication(document) {
        const result = await this.getApplicationById(document._id);
        const isValidRejectionState = result.length > 0 && result[0].status === REJECTED && result[0].status != IN_REVIEW;
        if (isValidRejectionState) throw Error("Invalid Application Submission - Previous State 'In Review' required for rejected application");
        return (result) ? result[0] : {};
    }

    async deleteApplication(document) {
        const deletedOne = await this.getApplicationById(document._id);
        let result = {};
        if (deletedOne && await this.dbService.deleteOne(APPLICATION, {_id: document._id})) {
            result = deletedOne[0];
        }
        return result;
    }

    async approveApplication(document) {
        let result = {};
        const application = await this.getApplicationById(document._id);
        const isValidState = application.length > 0 && application[0].status;
        // In Reviewed -> Approved
        if (isValidState && application[0].status != IN_REVIEW) throw Error("Invalid Application Submission - Previous State 'In Review' required");
        if (isValidState) {
            const history = EventBuilder.createEvent({status: APPROVED, comment: document.comment});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {reviewComment: document.comment, wholeProgram: document.wholeProgram, status: APPROVED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : {};
        }
        return (result) ? result[0] : {};
    }

    async rejectApplication(document) {
        let result = {};
        const application = await this.getApplicationById(document._id);
        const isValidState = application.length > 0 && application[0].status;
        // In Reviewed -> Rejected
        if (isValidState && application[0].status != IN_REVIEW) throw Error("Invalid Application Submission - Previous State 'In Review' required");
        if (isValidState) {
            const history = EventBuilder.createEvent({status: REJECTED, comment: document.comment});
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
                $push: {history}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : {};
        }
        return (result) ? result[0] : {};
    }
}

module.exports = {
    Application
};
