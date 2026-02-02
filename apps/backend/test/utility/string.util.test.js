const {isCaseInsensitiveEqual, isElementInArray, isElementInArrayCaseInsensitive, parseArrToStr,
    replaceMessageVariables, extractAndJoinFields, replaceErrorString, isValidFileExtension, fileSizeFormatter
} = require("../../utility/string-util");
const {parseJsonString} = require("../../crdc-datahub-database-drivers/utility/string-utility");
describe('Util Test', () => {
    let consoleErrorSpy;

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

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

        const testsCommaSpaceSplitter = [
            {
                arr: [
                    { field1: "value11", field2: "value12", field3: "value13" },
                    { field1: "value21", field2: "value22", field3: "value23" },
                ],
                fieldsToExtract: ["field1", "field2"],
                result: ["value11, value12", "value21, value22"]
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

        for (let test of testsCommaSpaceSplitter) {
            const result = extractAndJoinFields(test.arr,test.fieldsToExtract, ", ");
            expect(test.result).toStrictEqual(result);
        }
    });

    test('Should parse a valid JSON string', () => {
        const jsonString = '{"key": "value", "number": 42}';
        const expectedObject = { key: 'value', number: 42 };
        expect(parseJsonString(jsonString)).toEqual(expectedObject);
    });

    test('Should handle parsing of an empty object', () => {
        const jsonString = '{}';
        const expectedObject = {};
        expect(parseJsonString(jsonString)).toEqual(expectedObject);
    });

    test('Should handle parsing of an array', () => {
        const jsonString = '[1, 2, 3]';
        const expectedArray = [1, 2, 3];
        expect(parseJsonString(jsonString)).toEqual(expectedArray);
    });

    test('Should throw an error for invalid JSON', () => {
        const invalidJsonString = '{"key": "value",}';
        parseJsonString(invalidJsonString);
        expect(consoleErrorSpy).toBeCalledTimes(1)
    });

    test('Should handle parsing of nested objects', () => {
        const jsonString = '{"outer": {"inner": {"inner_inner": {"key":1}}}}';
        const expectedObject = { outer: { inner: { inner_inner: {key:1} } } };
        expect(parseJsonString(jsonString)).toEqual(expectedObject);
    });

    test('Should handle parsing of null', () => {
        const jsonString = 'null';
        expect(parseJsonString(jsonString)).toBeNull();
    });

    test('replaces all occurrences of $item$ with the specified replacement text', () => {
        const originalString = "This is a duplicate study name. The $item$ study already exists in the system. Another $item$ is found.";
        const replacement = "'replaced name'";
        const expectedString = `This is a duplicate study name. The ${replacement} study already exists in the system. Another ${replacement} is found.`;
        const result = replaceErrorString(originalString, replacement);
        expect(result).toBe(expectedString);
    });

    test('null or undefined', () => {
        const originalString = "This is a duplicate study name. The $item$ study already exists in the system. Another $item$ is found.";
        const result = replaceErrorString(originalString);
        expect(result).toBe(originalString);
    });

    test('test valid file extensions', () => {
        expect(isValidFileExtension("file.txt.tsv.tsv")).toBe(true);
        expect(isValidFileExtension("file.txt")).toBe(true);
        expect(isValidFileExtension("file,txt")).toBe(false);
        expect(isValidFileExtension(".pdf")).toBe(false);
        expect(isValidFileExtension("test.test,pdf")).toBe(false);
        expect(isValidFileExtension("test,test,pdf")).toBe(false);
        expect(isValidFileExtension("test.test.file,pdf")).toBe(false);
        expect(isValidFileExtension("test.test,file.")).toBe(false);
        expect(isValidFileExtension("test.test,file.")).toBe(false);
        expect(isValidFileExtension("test.test.txt")).toBe(true);
        expect(isValidFileExtension("test,test,txt")).toBe(false);
        expect(isValidFileExtension("test,test.      ")).toBe(false);
        expect(isValidFileExtension("test.test.      ")).toBe(false);
        expect(isValidFileExtension("test.test?      ")).toBe(false);
        expect(isValidFileExtension("&&&.&&&&")).toBe(false);
        expect(isValidFileExtension("tes.&&&")).toBe(false);
    });


    test('test file size formatter', () => {
        expect(fileSizeFormatter(undefined)).toBe("0");
        expect(fileSizeFormatter(null)).toBe("0");
        expect(fileSizeFormatter("xxxx")).toBe("0");
        expect(fileSizeFormatter("null")).toBe("0");
        expect(fileSizeFormatter("         ")).toBe("0");
        expect(fileSizeFormatter(" ")).toBe("0");
        expect(fileSizeFormatter(0)).toBe("0");
        expect(fileSizeFormatter(500)).toBe("0.49 KB");
        expect(fileSizeFormatter(50000)).toBe("48.83 KB");
        expect(fileSizeFormatter(500000000000)).toBe("465.66 GB");
        expect(fileSizeFormatter(50000000000000)).toBe("45.47 TB");
    });
});