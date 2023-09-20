const ERROR = require("../../constants/error-constants");
const {verifySession} = require("../../verifier/user-info-verifier");
const USER_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-constants");
const ROLES = USER_CONSTANTS.USER.ROLES;


describe("user info verifier test", () => {
    let session;

    beforeEach(() => {
        session = {
            userInfo: {
                email: "test@email.com",
                firstName: "test first",
                lastName: "test last",
                IDP: "test-idp",
                _id: "777"
            }
        };
    });

    test("missing user info", () => {
       expect(() => {verifySession({})}).toThrow(ERROR.NOT_LOGGED_IN)
    });

    test("constructor successful", () => {
        expect(verifySession(session).userInfo).toBe(session.userInfo);
    });

    test("not initialized", () => {
        session.userInfo._id = undefined;
        expect(() => {verifySession(session).verifyInitialized()}).toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("initialization successful", () => {
        const sessionVerifier = verifySession(session);
        expect(sessionVerifier.verifyInitialized()).toStrictEqual(sessionVerifier);
    });

    test("verify role - no role", () => {
        const sessionVerifier = verifySession(session);
        expect(() => {sessionVerifier.verifyRole([ROLES.ADMIN])}).toThrow(ERROR.INVALID_ROLE);
    });

    test("verify role - no invalid role", () => {
        session.userInfo.role = ROLES.USER;
        const sessionVerifier = verifySession(session);
        expect(() => {sessionVerifier.verifyRole([ROLES.ADMIN])}).toThrow(ERROR.INVALID_ROLE);
    });

    test("verify role - valid role", () => {
        session.userInfo.role = ROLES.USER;
        const sessionVerifier = verifySession(session);
        expect(() => {sessionVerifier.verifyRole([ROLES.ADMIN, ROLES.USER])}).not.toThrowError();
    });


});