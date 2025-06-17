const {ValidationHandler} = require("../../utility/validation-handler");
describe('validation test', () => {
    test('/success', () => {
        const result = ValidationHandler.success();
        expect(result.success).toBeTruthy();
        expect(result.message).toBeFalsy;
    });

    test('/fail null', () => {
        const result = ValidationHandler.handle(null);
        expect(result.success).toBeFalsy();
    });

    test('/fail with message', () => {
        const result = ValidationHandler.handle("TEST");
        expect(result.success).toBeFalsy();
        expect(result.message).toStrictEqual("TEST");
    });

    test('/fail with multiple messages', () => {
        const errorMessages = ["ERROR-1", "ERROR-2"];
        const result = ValidationHandler.handle(errorMessages);
        expect(result.success).toBeFalsy();
        expect(result.message).toStrictEqual(errorMessages.join(", "));
    });
});