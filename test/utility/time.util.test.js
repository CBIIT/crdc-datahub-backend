const {subtractDaysFromNow} = require("../../crdc-datahub-database-drivers/utility/time-utility");
describe('Time Test', () => {
    test('/subtract days', () => {
        const days = subtractDaysFromNow(1);
        expect(days).not.toBeNull();
    });
});