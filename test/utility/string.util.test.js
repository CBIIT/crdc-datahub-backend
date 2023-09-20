const {isCaseInsensitiveEqual, isElementInArray, isElementInArrayCaseInsensitive, parseArrToStr,
    replaceMessageVariables, extractAndJoinFields
} = require("../../utility/string-util");
describe('Util Test', () => {
    test('/string case insensitive equal', () => {
        const test = [
            {src: "nih", target: 'NIH',result: true},
            {src: "NIH", target: 'NiH',result: true},
            {src: "nih", target: 'Nih',result: true},
            {src: "nih", target: '',result: false},
            {src: "nih", target: null,result: false}
        ];

        for (let t of test) {
            const result = isCaseInsensitiveEqual(t.src, t.target);
            expect(result).toBe(t.result);
        }
    });

    test('/inspect any element in array', () => {
        const test = [
            {arr: [], target: 'idp',result: false},
            {arr: undefined, target: 'NiH',result: false},
            {arr: null, target: 'Nih',result: false},
            {arr: ['nih'], target: 'NIH',result: false},
            {arr: ['nih', 'google'], target: 'nih',result: true},
            {arr: ['google', 'nih'], target: 'nIh',result: false}
        ];

        for (let t of test) {
            const result = isElementInArray(t.arr, t.target);
            expect(result).toBe(t.result);
        }
    });

    test('/inspect any case-insensitive element in array', () => {
        const test = [
            {arr: [], target: 'idp',result: false},
            {arr: ['NiH'], target: 'NIH',result: true},
            {arr: null, target: 'Nih',result: false},
            {arr: null, target: undefined,result: false},
            {arr: ['nIH'], target: 'Nih',result: true},
            {arr: ['nih'], target: 'NIH',result: true},
            {arr: ['google', 'nih'], target: 'nIh',result: true},
            {arr: ['google', 'nih'], target: 'NIH',result: true},
            {arr: ['google', 'nih', null], target: null,result: false},
            {arr: ['google', 'nih', null], target: 'GOOGLE',result: true},
            {arr: ['google', 'nih', undefined], target: undefined,result: false},
            {arr: ['google', 'nih', null], target: 'GOOGLE',result: true}
        ];

        for (let t of test) {
            const result = isElementInArrayCaseInsensitive(t.arr, t.target);
            expect(result).toBe(t.result);
        }
    });

    test('/parse array to splitted string', () => {
        const tests = [
            {arr: ["a", "b", "c", "d"], splitter: ",", result: "a,b,c,d"},
            {arr: ["a", "b", "", ""], splitter: ",", result: "a,b"},
            {arr: [null, undefined, "a", "b"], splitter: ",", result: "a,b"},
            {arr: ['a', undefined, "b"], splitter: ",", result: "a,b"},
            {arr: ["a"], result: "a"},
            {arr: undefined, result: ""},
            {arr: ["a","b,"], splitter: ",", result: "a,b,"},
            {arr: [], splitter: ",", result: ""},
            {arr: undefined, splitter: ",", result: ""},
            {arr: undefined, splitter: null, result: ""},
            {arr: null, splitter: null, result: ""},
            {arr: ["a","b"], splitter: ":", result: "a:b"},
            {arr: ["a","b"], splitter: " ", result: "a b"}
        ];

        for (let test of tests) {
            const result = parseArrToStr(test.arr,test.splitter);
            expect(result).toBe(test.result);
        }

        // No splitter
        expect(parseArrToStr(["ab", "cd"])).toBe("ab,cd");
    });

    test('/replace msg variables', () => {
        let messageVariables = {
            "arms": 'test',
            "firstName": "Bento",
            "lastName": `lastName`
        }

        let input = "This is arms $arms. Dear $firstName";

        const result = replaceMessageVariables(input, messageVariables);
        expect(result).toBe('This is arms test. Dear Bento');
    })


    test('extract fields from object', () => {
        const tests = [
            {
                arr: [
                    { field1: "value11", field2: "value12", field3: "value13" },
                    { field1: "value21", field2: "value22", field3: "value23" },
                ],
                fieldsToExtract: ["field1", "field2"],
                result: ["value11,value12", "value21,value22"]
            },
            {
                arr: [],
                fieldsToExtract: ["field1", "field2"],
                result: []
            },
            {
                arr: [{ field1: "value11", field2: "value12", field3: "value13" },
                    { field1: "value21", field2: "value22", field3: "value23" }],
                fieldsToExtract: [],
                result: []
            }
        ];

        for (let test of tests) {
            const result = extractAndJoinFields(test.arr,test.fieldsToExtract);
            expect(test.result).toStrictEqual(result);
        }
    });


});