const USER_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;
const {verifyValidationResultsReadPermissions} = require("../../verifier/permissions-verifier");

describe('Permissions Verifier Test', () => {
    const userID = "testUserID";
    const otherUserID = "testOtherUserID";
    const orgID = "testOrgID";
    const dataCommonsA = "testDataCommonsA"
    const dataCommonsB = "testDataCommonsB"
    let submission, user;
    beforeEach(() => {
        user = {
            _id: userID,
            role: ROLES.SUBMITTER,
            organization: {
                orgID: orgID
            },
            dataCommons: [dataCommonsA, dataCommonsB]
        }
        submission = {
            submitterID: userID,
            dataCommons: dataCommonsB,
            organization: {
                _id: orgID
            },
            collaborators: [
                {
                    collaboratorID: otherUserID
                }
            ]
        }
    });

    test('Test Admin permissions', () => {
        user.role = ROLES.ADMIN;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
    })

    test('Test Federal Lead permissions', () => {
        user.role = ROLES.FEDERAL_LEAD;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
    })

    test('Test Curator permissions', () => {
        user.role = ROLES.CURATOR;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
    })

    test('Test Org Owner permissions', () => {
        user.role = ROLES.ORG_OWNER;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
        submission.organization._id = "invalid";
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test Submitter permissions', () => {
        user.role = ROLES.SUBMITTER;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
        submission.submitterID = "invalid"
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test Data Commons Point of Contact permissions', () => {
        user.role = ROLES.DC_POC;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
        submission.dataCommons = "invalid"
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test Curator permissions', () => {
        user.role = ROLES.DC_POC;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
        submission.dataCommons = "invalid"
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test User permissions', () => {
        user.role = ROLES.USER;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test Collaborator permissions', () => {
        user.role = ROLES.USER;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
        submission.collaborators.push({collaboratorID: userID})
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(true);
    })

    test('Test missing user', () => {
        user = null;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test missing submission', () => {
        submission = null;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test missing collaborators', () => {
        user.role = ROLES.USER;
        submission.collaborators = null;
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })

    test('Test missing collaboratorID', () => {
        user.role = ROLES.USER;
        submission.collaborators.push({})
        expect(verifyValidationResultsReadPermissions(user, submission)).toBe(false);
    })


});