const {verifySession} = require("../verifier/user-info-verifier");
const {v4} = require('uuid')
const {getListDifference} = require("../utility/list-util");

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

    async addNewInstitutions(institutionNames){
        try{
            const existingInstitutions = await this.#listInstitutions();
            const newInstitutionNames = getListDifference(institutionNames, existingInstitutions);
            if (newInstitutionNames.length > 0){
                const newInstitutions = createNewInstitutions(newInstitutionNames);
                const insertResult = await this.institutionCollection.insertMany(newInstitutions);
                console.log(`${insertResult?.insertedCount} new institution(s) created in the database`)
            }
        }
        catch (exception){
            console.error('An exception occurred while attempting to create new institutions: ', exception);
        }
    }
}

function createNewInstitutions(institutionNames){
    let newInstitutions = [];
    institutionNames.forEach(name => {
        newInstitutions.push({
            _id: v4(undefined, undefined, undefined),
            name: name
        });
    });
    return newInstitutions;
}

module.exports = {
    InstitutionService,
    createNewInstitutions
};