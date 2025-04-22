const {ConfigurationService} =  require("../../services/configurationService");
const {AuthorizationService} =  require("../../services/authorization-service");
const {USER} =  require("../../crdc-datahub-database-drivers/constants/user-constants");
const PERMISSIONS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");

describe('authorization service test', () => {

    let configurationService;
    let authorizationService;
    let pbacDefaults;
    let userInput;
    let permissionInput;
    const noneOutput = {
        scopes: ["none"],
        scopeValues: []
    };

    beforeAll(() => {
        configurationService = new ConfigurationService();
        authorizationService = new AuthorizationService(configurationService);
        pbacDefaults = []
        userInput = {};
        permissionInput = null;
    });

    test("/Test invalid inputs", async () => {
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        // Empty user input
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(noneOutput);
        userInput = null;
        // Null user input
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(noneOutput);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [
                PERMISSIONS.DATA_SUBMISSION.VIEW + ":all",
            ]
        };
        // Null permission input
        expect(await authorizationService.getPermissionScope(userInput, null)).toStrictEqual(noneOutput);
        // Invalid permission input
        expect(await authorizationService.getPermissionScope(userInput, "invalid")).toStrictEqual(noneOutput);
    });

    test("/test reading the scope", async () => {
        configurationService.getPBACByRoles = jest.fn().mockReturnValue([]);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [
                PERMISSIONS.DATA_SUBMISSION.VIEW + ":all",
            ]
        };
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        // user has permission with scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["all"], scopeValues: []});
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW];
        // user has permission without scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(noneOutput);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.CREATE, PERMISSIONS.DATA_SUBMISSION.VIEW+ ":role", PERMISSIONS.DATA_SUBMISSION.CONFIRM];
        // user has permission in list
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["role"], scopeValues: []});
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW+ ":ROLE"];
        // user has permission with case insensitive scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["role"], scopeValues: []});
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW+ ":rOlE"];
        // user has permission with case insensitive scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["role"], scopeValues: []});
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW+ ":role+study+dc"];
        // user has permission with multiple scopes
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["role", "study", "dc"], scopeValues: []});
    });

    test("/test reading the scope values", async () => {
        configurationService.getPBACByRoles = jest.fn().mockReturnValue([]);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [
                PERMISSIONS.DATA_SUBMISSION.VIEW + ":study:study1+study2+study3",
            ]
        };
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        // user has permission with scope and scope values
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({
            scopes: ["study"],
            scopeValues: ["study1", "study2", "study3"]
        });
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW + ":study:study1+study2+study3:extrainformation"]
        // user has permission with scope, scope values, and extra information
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({
            scopes: ["study"],
            scopeValues: ["study1", "study2", "study3"]
        });
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW + ":study+DC:dcA+studyB+studyC:extrainformation"]
        // user has permission with multiple scopes, multiple scope values, and extra information
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({
            scopes: ["study", "dc"],
            scopeValues: ["dcA", "studyB", "studyC"]
        });
    });

    test("/test reading default scopes", async () => {
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [PERMISSIONS.DATA_SUBMISSION.VIEW]
        };
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        pbacDefaults = [
            {
                "role": USER.ROLES.SUBMITTER,
                "permissions": [
                    {
                        "_id": PERMISSIONS.DATA_SUBMISSION.CANCEL,
                        "scopes": ["none"]
                    },
                    {
                        "_id": PERMISSIONS.DATA_SUBMISSION.VIEW,
                        "scopes": ["all"]
                    }
                ]
            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        // test user has permission but no scopes, scopes are read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual({scopes: ["all"], scopeValues: []});
        userInput = {
            role: USER.ROLES.SUBMITTER
        };
        // test user has no permissions, scopes are not read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(noneOutput);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.CANCEL];
        // test user does not have the specified permission, scopes are not read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(noneOutput);
    });
});

