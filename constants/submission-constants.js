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
    },
    COLLABORATOR_PERMISSIONS: {
        CAN_EDIT: "Can Edit",
        NO_ACCESS: "No Access"
    },
    UPLOADING_HEARTBEAT_CONFIG_TYPE: "UPLOADING_HEARTBEAT",
    SUBMISSION_ORDER_BY_MAP
});
