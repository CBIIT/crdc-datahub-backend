const {verifySession} = require("../verifier/user-info-verifier");

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
}

module.exports = {
    InstitutionService
};