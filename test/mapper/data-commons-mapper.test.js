const {getDataCommonsOrigin, getDataCommonsDisplayNamesForApprovedStudy} = require("../../utility/data-commons-remapper");
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

    test('getDataCommonsDisplayNamesForApprovedStudy normalizes pendingImageDeIdentification to boolean', () => {
        const studyTrue = {
            _id: 's1',
            studyName: 'N',
            pendingImageDeIdentification: true
        };
        expect(getDataCommonsDisplayNamesForApprovedStudy(studyTrue).pendingImageDeIdentification).toBe(true);

        const studyAbsent = {_id: 's2', studyName: 'N2'};
        expect(getDataCommonsDisplayNamesForApprovedStudy(studyAbsent).pendingImageDeIdentification).toBe(false);

        const studyNull = {_id: 's3', studyName: 'N3', pendingImageDeIdentification: null};
        expect(getDataCommonsDisplayNamesForApprovedStudy(studyNull).pendingImageDeIdentification).toBe(false);
    });
});