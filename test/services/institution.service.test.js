const {createNewInstitutions} = require('../../services/institution-service');

describe('institution service test', () => {

    test("/createNewInstitutions test", () => {
        let newInstitutionNames = ["InstitutionA", "InstitutionB", "InstitutionC"];
        let newInstitutions = createNewInstitutions(newInstitutionNames);
        expect(newInstitutions.length).toBe(3);
        for (let i = 0; i < newInstitutions.length; i++) {
            institution = newInstitutions[i];
            expect(!!institution).toBe(true);
            expect(!!institution._id).toBe(true);
            expect(institution.name).toStrictEqual(newInstitutionNames[i]);
        }
        newInstitutionNames = [];
        newInstitutions = createNewInstitutions(newInstitutionNames);
        expect(newInstitutions).toStrictEqual([]);
    });
});
