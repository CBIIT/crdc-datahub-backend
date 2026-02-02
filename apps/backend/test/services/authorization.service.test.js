const {ConfigurationService} =  require("../../services/configurationService");
const {AuthorizationService} =  require("../../services/authorization-service");
const {USER} =  require("../../crdc-datahub-database-drivers/constants/user-constants");
const PERMISSIONS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");
const SCOPES = require("../../constants/permission-scope-constants");

describe('authorization service test', () => {

    let configurationService;
    let authorizationService;
    let pbacDefaults;
    let userInput;
    let permissionInput;
    const defaultOutput = [{
        scope: SCOPES.NONE,
        scopeValues: []
    }];

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
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput);
        userInput = null;
        // Null user input
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [
                PERMISSIONS.DATA_SUBMISSION.VIEW + ":all",
            ]
        };
        // Null permission input
        expect(await authorizationService.getPermissionScope(userInput, null)).toStrictEqual(defaultOutput);
        // Invalid permission input
        expect(await authorizationService.getPermissionScope(userInput, "invalid")).toStrictEqual(defaultOutput);
    });

    test("/test reading the scope", async () => {
        configurationService.getPBACByRoles = jest.fn().mockReturnValue([]);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [
                PERMISSIONS.DATA_SUBMISSION.VIEW + `:${SCOPES.ALL}`,
            ],
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
            dataCommons: ["dataCommons1", "dataCommons2"]
        };
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        // user has permission with scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual([{scope: SCOPES.ALL, scopeValues: []}]);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW];
        // user has permission without scope
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.CREATE, PERMISSIONS.DATA_SUBMISSION.VIEW+`:${SCOPES.ROLE}`, PERMISSIONS.DATA_SUBMISSION.CONFIRM];
        // user has permission in list
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual([{scope: SCOPES.ROLE, scopeValues: []}]);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.VIEW+ `:${SCOPES.ROLE}+${SCOPES.STUDY}+${SCOPES.DC}:${USER.ROLES.FEDERAL_LEAD}+${USER.ROLES.USER}:extrainfo`];
        // user has permission with multiple scopes, multiple scope values, and extra information
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual([
            {scope: SCOPES.STUDY, scopeValues: ["study1", "study2", "study3"]},
            {scope: SCOPES.DC, scopeValues: ["dataCommons1", "dataCommons2"]},
            {scope: SCOPES.ROLE, scopeValues: [USER.ROLES.FEDERAL_LEAD, USER.ROLES.USER]}
        ]);
    });

    test("/test reading default scopes and values", async () => {
        userInput = {
            role: USER.ROLES.SUBMITTER,
            permissions: [PERMISSIONS.DATA_SUBMISSION.VIEW, PERMISSIONS.DATA_SUBMISSION.CONFIRM],
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
        };
        permissionInput = PERMISSIONS.DATA_SUBMISSION.VIEW;
        pbacDefaults = [
            {
                "role": USER.ROLES.SUBMITTER,
                "permissions": [
                    {
                        "_id": `${PERMISSIONS.DATA_SUBMISSION.CANCEL}:${SCOPES.ALL}`
                    },
                    {
                        "_id": `${PERMISSIONS.DATA_SUBMISSION.VIEW}:${SCOPES.ROLE}+${SCOPES.STUDY}:${USER.ROLES.SUBMITTER}`
                    }
                ]
            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        // test user has permission but no scopes, scopes are read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual([
            {scope: SCOPES.STUDY, scopeValues: ["study1", "study2", "study3"]},
            {scope: SCOPES.ROLE, scopeValues: [USER.ROLES.SUBMITTER]}
        ]);
        permissionInput = PERMISSIONS.DATA_SUBMISSION.CONFIRM;
        // test user has permission without values but there are no defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput)
        userInput.permissions = null;
        // test user has no permissions, scopes are not read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput);
        userInput.permissions = [PERMISSIONS.DATA_SUBMISSION.CANCEL];
        // test user does not have the specified permission, scopes are not read from defaults
        expect(await authorizationService.getPermissionScope(userInput, permissionInput)).toStrictEqual(defaultOutput);
    });


    test("/Federal Lead permission", async () => {
        userInput = {
            role: USER.ROLES.FEDERAL_LEAD,
            permissions: [`${PERMISSIONS.ADMIN.MANAGE_USER}`],
            scopes: [SCOPES.DC],
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
            dataCommons: ["dataCommons1", "dataCommons2"]
            // scopeValues: ["test"]

        };
        const FEPBACDefaults = [
            {
                "role": USER.ROLES.FEDERAL_LEAD,
                "permissions": [
                    {
                        "_id": `${PERMISSIONS.ADMIN.MANAGE_USER}:${SCOPES.DC}:${USER.ROLES.FEDERAL_LEAD}`
                    }
                ]
            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(FEPBACDefaults);
        permissionInput = `${PERMISSIONS.ADMIN.MANAGE_USER}`;
        const expected = [
            {scope: SCOPES.DC, scopeValues: ["dataCommons1", "dataCommons2"]}
        ];

        const res = await authorizationService.getPermissionScope(userInput, permissionInput);
        expect(res).toStrictEqual(expected)
    });

    test("/Test getValidPermissions - null and empty inputs", async () => {
        const defaultOutput = []; // assuming invalid inputs return empty array

        expect(await authorizationService.filterValidPermissions(null, null)).toStrictEqual(defaultOutput);
        expect(await authorizationService.filterValidPermissions({}, [])).toStrictEqual(defaultOutput);
        expect(await authorizationService.filterValidPermissions({ role: USER.ROLES.SUBMITTER }, null)).toStrictEqual(defaultOutput);
    });


    // this should be deleted in the future
    test("/Test getValidPermissions - with scopes(studies)", async () => {
        configurationService.getPBACByRoles = jest.fn().mockReturnValue([]);
        userInput = {
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
        };

        const permissionInput = [
            `${PERMISSIONS.DATA_SUBMISSION.CREATE}:${SCOPES.ALL}`
        ];

        const expected = [
            `${PERMISSIONS.DATA_SUBMISSION.CREATE}:${SCOPES.ALL}`
        ];

        const result = await authorizationService.filterValidPermissions(userInput, permissionInput);
        expect(result).toStrictEqual(expected);
    });



    test("/Test getValidPermissions - without scopes(studies)", async () => {
        pbacDefaults = [
            {
                "role": USER.ROLES.SUBMITTER,
                "permissions": [
                ]
            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        userInput = {
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
        };

        const permissionInput = [
            `${PERMISSIONS.ADMIN.MANAGE_USER}:all`,
            `${PERMISSIONS.DATA_SUBMISSION.CANCEL}`,
            `${PERMISSIONS.DATA_SUBMISSION.VIEW}`,
            `${PERMISSIONS.DATA_SUBMISSION.CREATE}XXXX:${SCOPES.ALL}`,
            null,
            undefined
        ];

        const expected = [
            `${PERMISSIONS.ADMIN.MANAGE_USER}:all`
        ];

        const result = await authorizationService.filterValidPermissions(userInput, permissionInput);
        expect(result).toStrictEqual(expected);
    });


    test("/Test getValidPermissions - without/with scopes", async () => {
        pbacDefaults = [
            {
                role: USER.ROLES.SUBMITTER,
                permissions: [
                    {
                        "_id": `${PERMISSIONS.ADMIN.MANAGE_USER}:${SCOPES.ROLE}:${USER.ROLES.FEDERAL_LEAD}`
                    }
                ],

            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
            scopes: [SCOPES.ROLE],
        };

        const permissionInput = [
            `${PERMISSIONS.DATA_SUBMISSION.CANCEL}`,
            `${PERMISSIONS.DATA_SUBMISSION.VIEW}`,
            `${PERMISSIONS.DATA_SUBMISSION.CREATE}XXXX:${SCOPES.ALL}`,
            `${PERMISSIONS.ADMIN.MANAGE_USER}:${SCOPES.DC}:${USER.ROLES.FEDERAL_LEAD}`,
            `${PERMISSIONS.ADMIN.MANAGE_PROGRAMS}`,
            null,
            undefined
        ];
        // input scope is required
        const expected = [
            `${PERMISSIONS.ADMIN.MANAGE_USER}:${SCOPES.DC}:${USER.ROLES.FEDERAL_LEAD}`
        ];

        const result = await authorizationService.filterValidPermissions(userInput, permissionInput);
        expect(result).toStrictEqual(expected);
    });


    test("/Test submission request - invalid view permission", async () => {
        pbacDefaults = [
            {
                role: USER.ROLES.SUBMITTER,
                permissions: [
                    {
                        "_id": `${PERMISSIONS.SUBMISSION_REQUEST.VIEW}`
                    }
                ],

            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
            scopes: [SCOPES.ROLE],
        };

        const permissionInput = [
            `${PERMISSIONS.SUBMISSION_REQUEST.VIEW}XXXX`,
            null,
            undefined
        ];

        const result = await authorizationService.getPermissionScope(userInput, permissionInput);
        expect(result).toStrictEqual(defaultOutput);
    });


    test("/Test submission request - SR view permission", async () => {
        pbacDefaults = [
            {
                role: USER.ROLES.SUBMITTER,
                permissions: [
                    {
                        "_id": `${PERMISSIONS.SUBMISSION_REQUEST.VIEW}`
                    }
                ],

            }
        ];
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        userInput = {
            role: USER.ROLES.SUBMITTER,
            studies: [
                {_id: "study1"},
                {_id: "study2"},
                {_id: "study3"}
            ],
            scopes: [SCOPES.ROLE],
        };

        const permissionInput = [
            `${PERMISSIONS.SUBMISSION_REQUEST.VIEW}`,
            null,
            undefined
        ];

        const result = await authorizationService.getPermissionScope(userInput, permissionInput);
        expect(result).toStrictEqual(defaultOutput);
    });
});

