const {UserScope} = require("../../domain/user-scope");

describe('user scope test', () => {

    test('/check null role and all', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead"]}, {scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isPermittedRole(null) || userScope.isAllScope();
        expect(res).toBeTruthy();
    });

    test('/check valid role and all', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead"]}, {scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isPermittedRole("Federal Lead") || userScope.isAllScope();
        expect(res).toBeTruthy();
    });

    test('/check valid Submitter role', () => {
        const userScope = UserScope.create([{scope: "role", scopeValues: ["Federal Lead", "Submitter"]}]);
        const res = userScope.isPermittedRole("Submitter");
        expect(res).toBeTruthy();
    });


    test('/fail valid Submitter role', () => {
        const userScope = UserScope.create([{scope: "all", scopeValues: ["All"]}]);
        const res = userScope.isPermittedRole("Submitter");
        expect(res).toBeFalsy();
    });


});