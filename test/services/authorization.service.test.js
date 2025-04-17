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

    test("/test read scope from permission", () => {
        let permission = "data_submission:submitted"
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual(["all"])

    });

    test("/test get default scope", () => {
        user.permissions = [
            "data_submission:cancelled:none",
            "data_submission:submitted"
        ];
        let permission = "data_submission:submitted"
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual(["default"])
    });

    test("/test invalid permission", () => {
        let permission = "fake:permission"
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual([])
    });

    test("/test valid permission but no scopes", () => {
        let permission = "fake:permission"
        user.permissions = [
            "data_submission:cancelled:none",
            "data_submission:submitted:none",
            "fake:permission"
        ];
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual([])
    });

    test("/invalid permission input", () => {
        let permission = null;
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
        permission = 10;
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
        permission = undefined;
        expect(authorizationService.getPermissionScope(user, permission)).toStrictEqual([]);
    })
});

