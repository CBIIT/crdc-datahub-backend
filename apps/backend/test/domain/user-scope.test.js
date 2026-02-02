const {UserScope} = require("../../domain/user-scope");

describe('user scope test', () => {

    test('/check null role and all', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead"]}, {scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isRoleScope(null) || userScope.isAllScope();
        expect(res).toBeTruthy();
    });

    test('/check valid role and all', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead"]}, {scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isRoleScope("Federal Lead") || userScope.isAllScope();
        expect(res).toBeTruthy();
    });

    test('/check valid Submitter role', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead", "Submitter"]}]);
        const res = userScope.isRoleScope("Submitter");
        expect(res).toBeTruthy();
    });


    test('/fail valid Submitter role', () => {
        const userScope = UserScope.create([{scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isRoleScope("Submitter");
        expect(res).toBeFalsy();
    });


});