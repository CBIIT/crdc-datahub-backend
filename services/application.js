const {SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, IN_REVIEW} = require("../constants/application-constants");
const {APPLICATION_COLLECTION: APPLICATION} = require("../crdc-datahub-database-drivers/database-constants");
const {v4} = require('uuid')
const {getCurrentTimeYYYYMMDDSS} = require("../utility/time-utility");
const {HistoryEventBuilder} = require("../domain/history-event");
const {verifyApplication} = require("../verifier/application-verifier");
const {verifySession} = require("../verifier/session-verifier");
const ERROR = require("../constants/error-constants");

class Application {
    constructor(applicationCollection, dbService) {
        this.applicationCollection = applicationCollection;
        this.dbService = dbService;
    }

    async getApplication(params, context) {
        return this.getApplicationById(params._id);
    }

    async getApplicationById(id) {
        let result = await this.applicationCollection.find(id);
        if (result.length < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return result[0];
    }

    async createApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userID = context.userInfo.userID;
        const id = v4(undefined, undefined, undefined);
        let emptyApplication = {
            _id: id,
            status: IN_PROGRESS,
            createdAt: getCurrentTimeYYYYMMDDSS(),
            applicantID: userID
        };
        await this.applicationCollection.insert(emptyApplication);
        return emptyApplication;
    }

    async saveApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        params.application.updatedAt = getCurrentTimeYYYYMMDDSS();
        const result = await this.applicationCollection.update(params.application);
        const id = params.application._id;
        if (result.matchedCount < 1) throw new Error(ERROR.APPLICATION_NOT_FOUND+id);
        return this.getApplicationById(id);
    }

    async getMyLastApplication(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userID = context.userInfo.userID;
        const matchApplicantIDToUser = {"$match": {applicantID: userID}};
        const sortCreatedAtDescending = {"$sort": {createdAt: -1}};
        const limitReturnToOneApplication = {"$limit": 1};
        const pipeline = [
            matchApplicantIDToUser,
            sortCreatedAtDescending,
            limitReturnToOneApplication
        ];
        const result = await this.applicationCollection.aggregate(pipeline);
        if (result.length < 1) throw new Error(ERROR.NO_USER_APPLICATIONS);
        return result[0];
    }

    async listApplications(params, context) {
        verifySession(context)
            .verifyInitialized();
        let pipeline = [
            {"$skip": params.offset},
            {"$limit": params.first}
        ];
        return await this.applicationCollection.aggregate(pipeline);
    }

    async submitApplication(document, _) {
        const application = await this.getApplicationById(document._id);
        verifyApplication(application)
            .notEmpty()
            .state(IN_PROGRESS);
        // In Progress -> In Submitted
        const history = HistoryEventBuilder.createEvent({status: SUBMITTED});
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {status: SUBMITTED, updatedAt: history.dateTime},
            $push: {history}
        });
        return updated.modifiedCount && updated.modifiedCount > 0 ? await this.dbService.find(APPLICATION, {_id: document._id}) : null;
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
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Approved
        verifyApplication(application)
            .notEmpty()
            .state(IN_REVIEW);
        const history = HistoryEventBuilder.createEvent({status: APPROVED, comment: document.comment});
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, wholeProgram: document.wholeProgram, status: APPROVED, updatedAt: history.dateTime},
            $push: {history}
        });
        return (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : null;
    }

    async rejectApplication(document, _) {
        const application = await this.getApplicationById(document._id);
        // In Reviewed -> Rejected
        verifyApplication(application)
            .notEmpty()
            .state(IN_REVIEW);
        const history = HistoryEventBuilder.createEvent({status: REJECTED, comment: document.comment});
        const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
            $set: {reviewComment: document.comment, status: REJECTED, updatedAt: history.dateTime},
            $push: {history}
        });
        return (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : null;
    }
}

module.exports = {
    Application
};

