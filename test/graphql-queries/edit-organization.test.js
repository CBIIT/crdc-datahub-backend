const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");

describe('Test Organization Service', () => {
    let organization;

    beforeAll(() => {
        organization = new Organization();
    })

    test('Check for read-only violations', async () => {
        let initialNaProgram = {
            "_id": "437e864a-621b-40f5-b214-3dc368137081",
            "name": "NA",
            "abbreviation": "NA",
            "description": "This is a catch-all place for all studies without a program associated.",
            "status": "Active",
            "bucketName": "crdc-hub-dev-submission",
            "rootPath": "437e864a-621b-40f5-b214-3dc368137081",
            "createdAt": {
                "$date": "2025-05-06T00:00:00.000Z"
            },
            "updateAt": {
                "$date": "2025-05-06T00:00:00.000Z"
            },
            "studies": [],
            "readOnly": true
        };
        const defaultParams = {
            "name": "NA",
            "abbreviation": "NA",
            "description": "This is a catch-all place for all studies without a program associated.",
            "status": "Active"
            // studies array removed since studies are now referenced by programID, not stored in programs
        };
        let params = {...defaultParams};
        // read only flag with no changes
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(false);
        // read only flag with name update violation
        params.name = "test";
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(true);
        params = {...defaultParams};
        // read only flag with abbreviation update violation
        params.abbreviation = "test";
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(true);
        params = {...defaultParams};
        // read only flag with description update violation
        params.description = "test";
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(true);
        params = {...defaultParams};
        // read only flag with status update violation
        params.status = "test";
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(true);
        params = {...defaultParams};
        // read only flag with no updates
        params = {};
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(false);
        params = {...defaultParams};
        // no read only flag
        initialNaProgram.readOnly = false;
        params.name = "test";
        expect(organization.checkForReadOnlyViolation(initialNaProgram, params)).toBe(false);
    });

});