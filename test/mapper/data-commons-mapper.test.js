const {getDataCommonsOrigin} = require("../../utility/data-commons-remapper");
describe('data commons mapper test', () => {
    test('/getDataCommonsOrigin', () => {
        expect(getDataCommonsOrigin("GC")).toBe("CDS");
        expect(getDataCommonsOrigin("PDC")).toBe(undefined);
        expect(getDataCommonsOrigin(null)).toBe(null);
    });


    test('/getDataCommonsOrigin array', () => {
        const originalDataCommons = (["GC", "ICDC"] || []).map(value => {
            const original = getDataCommonsOrigin(value);
            return original ? original : value;
        });
        expect(originalDataCommons).toEqual(["CDS", "ICDC"]);
    });
});