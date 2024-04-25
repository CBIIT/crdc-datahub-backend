const ERROR = {
    NOT_LOGGED_IN: "A user must be logged in to call this API",
    SESSION_NOT_INITIALIZED: "Internal error, a user is logged in but user data has not been initialized in the session",
    DATABASE_OPERATION_FAILED: "Database operation failed, please see logs for more information",
    APPLICATION_NOT_FOUND: "The provided application ID was not found in the database. Provided _id: ",
    UPDATE_FAILED: "Update unsuccessful",
    VERIFY: {
        UNDEFINED_APPLICATION: "Application array is undefined",
        EMPTY_APPLICATION: "Application array is empty",
        UNDEFINED_STATUS_APPLICATION: "Application state is undefined",
        INVALID_STATE_APPLICATION: "Application state is invalid",
        // Batch
        UNDEFINED_BATCH_SUBMISSION_ID: "Batch submission ID is undefined",
        UNDEFINED_BATCH_ID: "Batch ID is undefined",
        UNDEFINED_BATCH_FILE: "Batch file is undefined",
        UNDEFINED_BATCH_METADATA_INTENTION: "Batch metadata-intention is undefined",
        UNDEFINED_BATCH_TYPE: "Batch metadata-intention is undefined",
        EMPTY_BATCH_FILE: "Batch file is empty",
        INVALID_BATCH_TYPE: "Batch type is invalid",
        INVALID_METADATA_INTENTION_TYPE: "Metadata Intention type is invalid",
        // submission action
        INVALID_SUBMISSION_ACTION: "Invalid submission action:",
        INVALID_SUBMISSION_ACTION_STATUS: "Invalid submission status for the action:",
        INVALID_SUBMIT_ACTION: "Invalid submission action, user role and submission status requirements are not met.",
        INVALID_SUBMISSION_ACTION_ROLE: "Invalid user role for the action:",
        INVALID_SUBMISSION_ID: "submissionID can't be empty!",
        EMPTY_ROOT_PATH: "RootPath is missing in the submission",
        REJECT_ACTION_COMMENT_REQUIRED: "Reject submission action must include a comment.",
        SUBMIT_ACTION_COMMENT_REQUIRED: "Submit action must include a comment."
    },
    // Batch
    FAILED_NEW_BATCH_INSERTION: "An error occurred while creating a new batch",
    NEW_BATCH_NO_ORGANIZATION: "The user attempting to create a batch does not have any organizational record",
    FAILED_NEW_BATCH_NO_ROOT_PATH: "The batch creation is aborted because the current submission is missing a rootpath",
    INVALID_BATCH_PERMISSION: "You do not have permission to run a batch operation",
    SUBMISSION_NOT_EXIST: "The submission you are trying to access does not exist",
    BATCH_NOT_EXIST: "The batch you are trying to access does not exist",
    INVALID_UPDATE_BATCH_STATUS: "The batch update is aborted because the current batch status is not suitable for modification",
    FAILED_BATCH_UPDATE: "An error occurred while updating a batch",
    INVALID_BATCH_INTENTION: "Uploading data files is not allowed for a Delete submission",
    // Approved Studies
    APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies into the database.",
    ORGANIZATION_APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies for the organization into the database.",
    FAILED_STORE_APPROVED_STUDIES: "The approved studies are not being stored because the questionnaire data string is not correctly parsed",
    // Submission Permission
    INVALID_SUBMISSION_STATUS: "The batch creation is aborted because the current submission is not in the valid state to be created.",
    // Create Submission
    CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED: "The submitter/organization owner does not have an organization assigned. Thus, the data submission was not created",
    CREATE_SUBMISSION_INSERTION_ERROR: "An error occurred while attempting to insert the created data submission into the database",
    CREATE_SUBMISSION_INVALID_PARAMS: "One or more of the parameters for creating a submission is invalid",
    CREATE_SUBMISSION_INVALID_INTENTION: "submission intention is invalid",
    UPDATE_SUBMISSION_ERROR:"An error occurred while attempting to update the submission in the database",
    CREATE_SUBMISSION_INVALID_DATA_COMMONS: "Invalid Data Commons for creating a submission",
    CREATE_SUBMISSION_NO_MATCHING_STUDY: "The study provided does not match an approved study within the user's organization",
    // List Submissions
    LIST_SUBMISSION_INVALID_STATUS_FILTER: "The status filter is invalid",
    INVALID_SUBMISSION_PERMISSION: "You do not have the correct permissions to list submissions",
    INVALID_STATS_SUBMISSION_PERMISSION: "You do not have permission to see the submission stats.",
    INVALID_ROLE: "You do not have the correct role to perform this operation",
    INVALID_PERMISSION: "You do not have permission to view this application",
    // Submission Notification
    NO_SUBMISSION_RECEIVER: "Submission is unable to send an email notification",
    // Validate Submission
    FAILED_VALIDATE_CROSS_SUBMISSION: "Failed to validate cross-submission",
    FAILED_VALIDATE_METADATA: "Failed to validate metadata",
    FAILED_VALIDATE_FILE: "Failed to validate data file",
    FAILED_COMPLETE_SUBMISSION: "Failed to send a complete submission message",
    NO_VALIDATION_FILE: "No file manifest(s) are uploaded for file validation",
    NO_VALIDATION_METADATA: "No metadata for validation",
    NO_NEW_VALIDATION_METADATA: "No new metadata for validation",
    INVALID_VALIDATION_STATUS: "A data record can not be validated because of its invalid status.",
    INVALID_SUBMISSION_SCOPE: "submission scope is invalid",
    INVALID_SUBMISSION_TYPE: "submission type is invalid",
    INVALID_VALIDATE_METADATA: "You do not have permission to validate the metadata",
    INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS: "You do not have permission to view the validation results for this submission",
    INVALID_PERMISSION_TO_VIEW_NODE_TYPES: "You do not have permission to view the node types included in this submission",
    // Token
    INVALID_TOKEN_EMPTY: "Invalid token: it is empty string!",
    INVALID_TOKEN_NO_USER: "Invalid token: no user info!",
    INVALID_TOKEN_NO_USER_ID: 'Invalid token: no user id!',
    INVALID_SUBMISSION_EMPTY: 'Invalid submissionID: it can not be empty string!',
    INVALID_SUBMISSION_NOT_FOUND: "Cant find the submission by submissionID",
    INVALID_SUBMITTER: "The user has no permissions to upload data for the submission",
    INVALID_SESSION_OR_TOKEN: "No valid session or valid API token",
    FAILED_LIST_LOG: "Failed to get log file(s) for submission",
    // AWS
    FAILED_SQS_SEND: "Failed to send a message to aws SQS queue",
    //export dataRecords
    INVALID_EXPORT_METADATA: "You do not have permission to export submission data",
    INVALID_DATA_MODEL_VERSION: "An error occurred while trying to retrieve the data model version from the given URL",
    // delete submission error file list
    DELETE_NO_FILE_SUBMISSION: "No extra file found",
    DELETE_NO_EXISTS_SUBMISSION: "No extra files found for deletion in the bucket"
}

module.exports = ERROR;
