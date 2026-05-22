const {
    verifySubmissionAction,
    isSubmitLikeActionName
} = require('../../verifier/submission-verifier');
const {
    IN_PROGRESS,
    SUBMITTED,
    ACTIONS
} = require('../../constants/submission-constants');

describe('verifySubmissionAction', () => {
    it('resolves Admin Submit to Submitted like Submit', () => {
        const v = verifySubmissionAction(ACTIONS.ADMIN_SUBMIT, IN_PROGRESS, null);
        expect(v.getNewStatus()).toBe(SUBMITTED);
    });

    it('rejects unknown action', () => {
        expect(() => verifySubmissionAction('Unknown', IN_PROGRESS, null)).toThrow();
    });
});

describe('isSubmitLikeActionName', () => {
    it('returns true for Submit and Admin Submit', () => {
        expect(isSubmitLikeActionName(ACTIONS.SUBMIT)).toBe(true);
        expect(isSubmitLikeActionName(ACTIONS.ADMIN_SUBMIT)).toBe(true);
        expect(isSubmitLikeActionName(ACTIONS.RELEASE)).toBe(false);
    });
});
