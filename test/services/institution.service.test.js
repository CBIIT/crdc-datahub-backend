const {createNewInstitutions} = require('../../services/institution-service');
const {INSTITUTION} = require('../../crdc-datahub-database-drivers/constants/organization-constants');

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

    test("/createNewInstitutions should create institutions with non-null status", () => {
        let newInstitutionNames = ["TestInstitution1", "TestInstitution2"];
        let newInstitutions = createNewInstitutions(newInstitutionNames);
        
        expect(newInstitutions.length).toBe(2);
        for (let i = 0; i < newInstitutions.length; i++) {
            const institution = newInstitutions[i];
            expect(!!institution).toBe(true);
            expect(!!institution._id).toBe(true);
            expect(institution.name).toStrictEqual(newInstitutionNames[i]);
            expect(institution.status).not.toBeNull();
            expect(institution.status).not.toBeUndefined();
            expect(typeof institution.status).toBe('string');
            expect(institution.status).toBe(INSTITUTION.STATUSES.ACTIVE);
        }
    });
});
