module.exports = Object.freeze({
    // Data Submission Status
    NEW: 'New',
    IN_PROGRESS: 'In Progress',
    SUBMITTED: 'Submitted',
    RELEASED: 'Released',
    COMPLETED: 'Completed',
    ARCHIVED: 'Archived',
    CANCELED:'Canceled',
    REJECTED:'Rejected',
    WITHDRAWN: 'Withdrawn',
    EXPORT: "Export metadata",
    //data submission actions
    ACTIONS: {
        SUBMIT: "Submit",
        RELEASE: "Release",
        COMPLETE: "Complete",
        ARCHIVE: "Archive",
        CANCEL: "Cancel",
        REJECT: "Reject",
        WITHDRAW: "Withdraw",
        RESUME: "Resume",
        REJECT_SUBMIT: "Reject_Submitted",
        REJECT_RELEASE: "Reject_Released"
    },
    VALIDATION_STATUS: {
        NEW: "New",
        VALIDATING: "Validating",
        PASSED: "Passed",
        WARNING: "Warning",
        ERROR: "Error"
    },
    VALIDATION: {
        TYPES: {
            FILE: "file",
            DATA_FILE: "data file",
            METADATA: "metadata"
        },
        SCOPE: {
            NEW: "new",
            ALL: "all"
        }
    }
});
