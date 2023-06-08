const {APPLICATION} = require("../constants/mongo-db-constants");
const {v4} = require('uuid');

class Application {
    constructor(dbService) {
        this.dbService = dbService;
    }

    async getApplicationById(id) {
        return await this.dbService.find(APPLICATION, {_id: id});
    }

    async submitApplication(document) {
        // if parameter includes id, it means an identity key
        const uuid = (document._id) && (document._id !== '') ? document._id : v4();
        const insertedDocument = await this.dbService.insertOne(APPLICATION, {_id: uuid,...document.application});
        const result = await this.dbService.find(APPLICATION, {_id: insertedDocument.insertedId});
        return (result) ? result[0] : {};
    }

    async reopenApplication(document) {
        const result = await this.getApplicationById(document._id);
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
        if (await this.getApplicationById(document._id)) {
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {comment: document.comment, wholeProgram: document.wholeProgram}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : {};
        }
        return result;
    }

    async rejectApplication(document) {
        let result = {};
        if (await this.getApplicationById(document._id)) {
            const updated = await this.dbService.updateOne(APPLICATION, {_id: document._id}, {
                $set: {comment: document.comment}
            });
            result = (updated.modifiedCount && updated.modifiedCount > 0) ? await this.dbService.find(APPLICATION, {_id: document._id}) : {};
        }
        return result;
    }
}

module.exports = {
    Application
};
