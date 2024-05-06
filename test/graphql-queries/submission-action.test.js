const ERROR = require("../../constants/error-constants");
const {MongoDBCollection} = require("../../crdc-datahub-database-drivers/mongodb-collection");
const {Application} = require("../../services/application");
const {TEST_SESSION, TEST_APPLICATION} = require("../test-constants");
const {v4} = require("uuid");
const {IN_PROGRESS} = require("../../constants/application-constants");
const {Submission} = require("../../services/submission");

jest.mock("../../crdc-datahub-database-drivers/mongodb-collection");
const applicationCollection = new MongoDBCollection();
const logCollection = new MongoDBCollection();
const dataInterface = new Application(logCollection,applicationCollection);
const rewire = require('rewire');
const Submission = rewire("../../services/submission");



describe('Submission', () => {
    describe('publicMethod', () => {
        it('calls the privateMethod', () => {
            // Mocking dependencies
            const submission = new Submission(
                /* mock logCollection */ {},
                /* mock submissionCollection */ {},
                /* mock batchService */ {},
                /* mock userService */ {},
                /* mock organizationService */ {},
                /* mock notificationService */ {},
                /* mock dataRecordService */ {},
                /* mock tier */ {},
                /* mock dataModelInfo */ {},
                /* mock awsService */ {},
                /* mock metadataQueueName */ 'mockMetadataQueueName',
                /* mock s3Service */ {}
            );

            // Spy on the private method
            const privateMethodSpy = jest.spyOn(submission.__get__('Submission').prototype, '#isValidRelease').mockReturnValue('mocked private method');
            const result = submission.submissionAction();
            // const result = submission.release;

            // Verify that the private method was called
            expect(privateMethodSpy).toHaveBeenCalled();

            // Verify the result of the public method
            expect(result).toBe('mocked private method');
        });
    });
});
// describe('Submission', () => {
//     describe('publicMethod', () => {
//         it('calls the privateMethod', () => {
//             // Mocking dependencies
//             const submission = new Submission(
//                 /* mock logCollection */,
//                 /* mock submissionCollection */,
//                 /* mock batchService */,
//                 /* mock userService */,
//                 /* mock organizationService */,
//                 /* mock notificationService */,
//                 /* mock dataRecordService */,
//                 /* mock tier */,
//                 /* mock dataModelInfo */,
//                 /* mock awsService */,
//                 /* mock metadataQueueName */,
//                 /* mock s3Service */
//             );
//
//             // Spy on the private method
//             const privateMethodSpy = jest.spyOn(submission, '#privateMethod').mockReturnValue('mocked private method');
//
//             // Call the public method
//             const result = submission.publicMethod();
//
//             // Verify that the private method was called
//             expect(privateMethodSpy).toHaveBeenCalled();
//
//             // Verify the result of the public method
//             expect(result).toBe('mocked private method');
//         });
//     });
// });

// describe('saveApplication API test', () => {
//
//     test("session validation failure", async () => {
//         let session = {};
//         expect(dataInterface.saveApplication({}, session)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
//         session = {
//             userInfo: {}
//         };
//         expect(dataInterface.saveApplication({}, session)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
//     });
// });
