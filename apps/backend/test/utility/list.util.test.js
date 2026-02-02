const {getListDifference} = require("../../utility/list-util");

describe('List Utility Test', () => {

    test('/getDifference test', () => {
        let listA = ["1", "2", "3"];
        let listB = ["1", "2", "3"];
        expect(getListDifference(listA, listB)).toStrictEqual([]);
        listB = ["1", "2", "4"];
        expect(getListDifference(listA, listB)).toStrictEqual(["3"]);
        listB = ["1", "2", "4"];
        expect(getListDifference(listB, listA)).toStrictEqual(["4"]);
        listB = null
        expect(() => getListDifference(listA, listB)).toThrow()
        listB = "test"
        expect(() => getListDifference(listA, listB)).toThrow()
    })
})
