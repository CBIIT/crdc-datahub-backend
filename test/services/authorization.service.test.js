const {ConfigurationService} =  require("../../services/configurationService");
const {AuthorizationService} =  require("../../services/authorization-service");
const {USER} =  require("../../crdc-datahub-database-drivers/constants/user-constants");
const ERROR = require("../../constants/error-constants");


describe('authorization service test', () => {

    let configurationService;
    let authorizationService;
    let pbacDefaults;
    let user;

    beforeAll(() => {
        configurationService = new ConfigurationService();
        pbacDefaults = [
            {
                role: USER.ROLES.ADMIN,
                permissions: [
                    {
                        _id: "fake",
                        scopes: ["failed test"]
                    },
                    {
                        _id: "data_submission:submitted",
                        scopes: ["default"]
                    }
                ]
            }
        ]
        configurationService.getPBACByRoles = jest.fn().mockReturnValue(pbacDefaults);
        authorizationService = new AuthorizationService(configurationService);
        user = {
            role: USER.ROLES.ADMIN,
            permissions: [
                "data_submission:cancelled:none",
                'data_submission:submitted:all'
            ]
        };
    });

    test("/test read scope from permission", async () => {
        let permission = "data_submission:submitted"
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual(["all"])

    });

    test("/test get default scope", async () => {
        user.permissions = [
            "data_submission:cancelled:none",
            "data_submission:submitted"
        ];
        let permission = "data_submission:submitted"
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual(["default"])
    });

    test("/test invalid permission", async () => {
        let permission = "fake:permission"
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual([])
    });

    test("/test valid permission but no scopes", async () => {
        let permission = "fake:permission"
        user.permissions = [
            "data_submission:cancelled:none",
            "data_submission:submitted:none",
            "fake:permission"
        ];
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual([])
    });

    test("/invalid permission input", async () => {
        let permission = null;
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
        permission = 10;
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
        permission = undefined;
        expect(await authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
    })

});

