const {verifySession} = require("../verifier/user-info-verifier");
const {v4} = require('uuid')

class InstitutionService {

    constructor(institutionCollection) {
        this.institutionCollection = institutionCollection;
    }

    // Verify the user session then call #listInsitutions()
    async listInstitutions(params, context) {
        verifySession(context)
            .verifyInitialized();
        return await this.#listInstitutions();
    }

    // Returns all institution names as a String array
    async #listInstitutions() {
        const institutions = await this.institutionCollection.findAll();
        let institutionsArray = [];
        institutions.forEach(x => {
            if (x.name) {
                institutionsArray.push(x.name);
            }
        });
        return institutionsArray;
    }

    // Create institutions if they don't already exist in the database
    async addNewInstitutions(institutionNames) {
        institutionNames = institutionNames instanceof Array ? institutionNames : [];
        if (institutionNames.length > 0){
            const existingInstitutions = await this.#listInstitutions();
            let newInstitutions = [];
            institutionNames.forEach(name => {
                if (!existingInstitutions.includes(name)) {
                    newInstitutions.push({
                        _id: v4(undefined, undefined, undefined),
                        name: name
                    });
                }
            });
            if (newInstitutions.length > 0){
                const insertResult = await this.institutionCollection.insertMany(newInstitutions);
                console.log(`${insertResult?.insertedCount} new institution(s) created in the database`)
            }
        }
    }
}

module.exports = {
    InstitutionService
};