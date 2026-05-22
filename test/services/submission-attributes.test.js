const { SubmissionAttributes } = require('../../services/submission');
const {
    VALIDATION_STATUS,
    DATA_TYPE,
    INTENTION,
    IN_PROGRESS,
} = require('../../constants/submission-constants');

describe('SubmissionAttributes', () => {
    const baseSubmission = {
        status: IN_PROGRESS,
        dataType: DATA_TYPE.METADATA_ONLY,
        metadataValidationStatus: VALIDATION_STATUS.PASSED,
        fileValidationStatus: null,
        crossSubmissionStatus: null,
        intention: INTENTION.UPDATE,
    };

    describe('validation status handling', () => {
        test('Error status should be treated as blocking', () => {
            const submission = {
                ...baseSubmission,
                metadataValidationStatus: VALIDATION_STATUS.ERROR,
            };
            const attrs = SubmissionAttributes.create(false, submission, 0, false, false);
            expect(attrs.isMetadataValidationError).toBe(true);
            expect(attrs.isValidationNotPassed()).toBe(true);
        });

        test('admin should be able to override Error status', () => {
            const submission = {
                ...baseSubmission,
                metadataValidationStatus: VALIDATION_STATUS.ERROR,
            };
            const attrs = SubmissionAttributes.create(true, submission, 0, false, false);
            expect(attrs.isMetadataValidationError).toBe(true);
            expect(attrs.isReadyMetadataOnly).toBe(true);
        });

        test('file Error status should be treated as blocking', () => {
            const submission = {
                ...baseSubmission,
                dataType: DATA_TYPE.METADATA_AND_DATA_FILES,
                metadataValidationStatus: VALIDATION_STATUS.PASSED,
                fileValidationStatus: VALIDATION_STATUS.ERROR,
            };
            const attrs = SubmissionAttributes.create(false, submission, 100, false, false);
            expect(attrs.isDatafileValidationError).toBe(true);
            expect(attrs.isValidationNotPassed()).toBe(true);
        });

        test('Passed status should not be treated as error', () => {
            const submission = {
                ...baseSubmission,
                metadataValidationStatus: VALIDATION_STATUS.PASSED,
            };
            const attrs = SubmissionAttributes.create(false, submission, 0, false, false);
            expect(attrs.isMetadataValidationError).toBe(false);
            expect(attrs.isValidationNotPassed()).toBe(false);
        });

        test('Warning status should not be treated as error', () => {
            const submission = {
                ...baseSubmission,
                metadataValidationStatus: VALIDATION_STATUS.WARNING,
            };
            const attrs = SubmissionAttributes.create(false, submission, 0, false, false);
            expect(attrs.isMetadataValidationError).toBe(false);
            expect(attrs.isValidationNotPassed()).toBe(false);
        });
    });
});
