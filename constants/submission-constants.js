// Submission orderBy mapping for Prisma queries
// Note: organization filter in listSubmissions always expects organization names, not IDs
const SUBMISSION_ORDER_BY_MAP = {
    "updatedAt": "updatedAt",
    "createdAt": "createdAt",
    "name": "name",
    "dataCommons": "dataCommons",
    "organization": "organization.name",
    "studyAbbreviation": "study.studyAbbreviation",
    "dbGaPID": "dbGaPID",
    "status": "status",
    "concierge": "concierge",
    "dataFileSize.size": "dataFileSize.size",
    "submitterName": "submitter.fullName",
    "conciergeName": "concierge.fullName",
};

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
        ADMIN_SUBMIT: "Admin Submit",
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
    /** Persisted on Submission when status becomes Submitted */
    SUBMISSION_TYPE: {
        ADMIN: "Admin",
        REGULAR: "Regular"
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
        },
        BATCH_MESSAGE_TYPE: "Validate Metadata Batch",
        METADATA_BATCH_CONFIG_TYPE: "METADATA_VALIDATION_BATCH_SIZE",
        DEFAULT_METADATA_BATCH_SIZE: 1000,
        MIN_METADATA_BATCH_SIZE: 100,
        // SQS FIFO limit is 256KB; ~6,890 UUIDs fit per message. 5,000 provides ~27% headroom.
        MAX_METADATA_BATCH_SIZE: 5000
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
        NAME_MAX_LENGTH: 25,
        APPROVE_COMMENT_MAX_LENGTH: 10000,
        REJECT_COMMENT_MAX_LENGTH: 10000,
        INQUIRE_COMMENT_MAX_LENGTH: 10000,
        CANCEL_COMMENT_MAX_LENGTH: 500,
        RESTORE_COMMENT_MAX_LENGTH: 500,
        REQUEST_PV_COMMENT_MAX_LENGTH: 500
    },
    COLLABORATOR_PERMISSIONS: {
        CAN_EDIT: "Can Edit",
        NO_ACCESS: "No Access"
    },
    UPLOADING_HEARTBEAT_CONFIG_TYPE: "UPLOADING_HEARTBEAT",
    SUBMISSION_ORDER_BY_MAP
});
