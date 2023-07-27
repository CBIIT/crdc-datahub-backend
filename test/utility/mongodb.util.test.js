const {DIRECTION} = require("../../crdc-datahub-database-drivers/constants/monogodb-constants");
const {getSortDirection} = require("../../crdc-datahub-database-drivers/utility/mongodb-utility");
describe('Mongo DB Utility Test', () => {
    test('mongo db search direction test, ()', () => {
        const tests = [
            {test: null, res: DIRECTION.DESC},
            {test: "test", res: DIRECTION.DESC},
            {test: "desc", res: DIRECTION.DESC},
            {test: "deSC", res: DIRECTION.DESC},
            {test: "asc", res: DIRECTION.ASC},
            {test: "ASc", res: DIRECTION.ASC},
            {test: undefined, res: DIRECTION.DESC},

        ];
        tests.forEach((t) => {
            const res = getSortDirection(t.test);
            expect(res).toBe(t.res);
        });
    })
});