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
    DELETED: "Deleted",
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
            METADATA: "metadata",
            CROSS_SUBMISSION: "cross-submission"
        },
        SCOPE: {
            NEW: "new",
            ALL: "all"
        }
    },
    INTENTION: {
        UPDATE: "New/Update",
        DELETE: "Delete"
    },
    DATA_FILE: "data file",
    DATA_TYPE: {
        METADATA_ONLY: "Metadata Only",
        METADATA_AND_DATA_FILES: "Metadata and Data Files"
    },
    CONSTRAINTS: {
        NAME_MAX_LENGTH: 25
    }
});
