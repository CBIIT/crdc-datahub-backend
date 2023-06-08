const ERROR = require("../../constants/error-constants");
const {verifySession} = require("../../verifier/session-verifier");


describe("session verifier test", () => {
    let session;

    beforeEach(() => {
        session = {
            userInfo: {
                email: "test@email.com",
                firstName: "test first",
                lastName: "test last",
                IDP: "test-idp",
                userID: "777"
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
        session.userInfo.userID = undefined;
        expect(() => {verifySession(session).verifyInitialized()}).toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });

    test("initialization successful", () => {
        const sessionVerifier = verifySession(session);
        expect(sessionVerifier.verifyInitialized()).toStrictEqual(sessionVerifier);
    });

});